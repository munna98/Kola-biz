import sys
import re

def process_file():
    with open('src-tauri/src/commands/invoices.rs', 'r', encoding='utf-8') as f:
        content = f.read()

    # We need to insert our helper function first
    helper = """
// ============= GST INVOICE HELPERS =============

#[derive(Debug)]
pub struct ProcessedVoucherItem {
    pub id: String,
    pub product_id: String,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub final_quantity: f64,
    pub unit_id: Option<String>,
    pub base_quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub discount_percent: f64,
    pub discount_amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub remarks: Option<String>,
    pub cgst_rate: f64,
    pub sgst_rate: f64,
    pub igst_rate: f64,
    pub cgst_amount: f64,
    pub sgst_amount: f64,
    pub igst_amount: f64,
    pub hsn_sac_code: Option<String>,
    pub gst_slab_id: Option<String>,
    pub resolved_gst_rate: f64,
}

pub struct ProcessedVoucher {
    pub items: Vec<ProcessedVoucherItem>,
    pub subtotal: f64,
    pub total_cgst: f64,
    pub total_sgst: f64,
    pub total_igst: f64,
}
"""

    if "pub struct ProcessedVoucherItem" not in content:
        # insert after use super::resolve_voucher_line_unit;
        content = content.replace("use crate::voucher_seq::get_next_voucher_number;", "use crate::voucher_seq::get_next_voucher_number;\n" + helper)

    # We will replace the body of the 4 functions.
    # To do this safely, we will find `pub async fn create_purchase_invoice(` and the closing `}` using bracket counting.
    
    def extract_function(name):
        start_idx = content.find(f"pub async fn {name}(")
        if start_idx == -1: return -1, -1
        # find the end of the arguments `) -> Result`
        bracket_start = content.find("{", start_idx)
        
        count = 1
        idx = bracket_start + 1
        while count > 0 and idx < len(content):
            if content[idx] == '{': count += 1
            elif content[idx] == '}': count -= 1
            idx += 1
        return start_idx, idx

    # Let's write the standardized replacements.
    # We will just write a function to construct the body.
    def make_body(func_type, action):
        is_purchase = "purchase" in func_type
        invoice_type = "purchase_invoice" if is_purchase else "sales_invoice"
        party_id_field = "supplier_id" if is_purchase else "customer_id"
        unit_kind = '"purchase"' if is_purchase else '"sale"'
        
        # update has invoice_id
        is_update = action == "update"
        
        # sales account
        main_account_code = "'5001'" if is_purchase else "'4001'"
        discount_account_code = "'4004'" if is_purchase else "'5007'"
        
        # Create helper logic code
        # Wait, Python string formatting with Rust code is messy due to {}
        # I'll just return a string using replace placeholders
        
        template = """__FUNC_DEF__
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

__VOUCHER_NO_LOGIC__

    let company_state: Option<String> = sqlx::query_scalar("SELECT state FROM company_profile ORDER BY id DESC LIMIT 1").fetch_optional(&mut *tx).await.ok().flatten();
    let party_state: Option<String> = sqlx::query_scalar("SELECT state FROM chart_of_accounts WHERE id = ?").bind(&invoice.__PARTY_ID__).fetch_optional(&mut *tx).await.ok().flatten();
    let is_inter_state = crate::commands::tax_utils::is_inter_state(company_state.as_deref(), party_state.as_deref());
    let tax_inclusive = invoice.tax_inclusive.unwrap_or(false);

    let mut processed_items = Vec::new();
    let mut subtotal = 0.0;
    let mut total_cgst = 0.0;
    let mut total_sgst = 0.0;
    let mut total_igst = 0.0;

    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let unit_snapshot = super::resolve_voucher_line_unit(&mut tx, &item.product_id, item.unit_id.as_deref(), __UNIT_KIND__, final_quantity).await?;
        
        let product: Option<(Option<String>, Option<String>)> = sqlx::query_as("SELECT hsn_sac_code, gst_slab_id FROM products WHERE id = ?").bind(&item.product_id).fetch_optional(&mut *tx).await.unwrap_or(None);
        let (hsn_sac_code, gst_slab_id) = product.unwrap_or((None, None));
        
        let mut effective_rate = item.tax_rate;
        if let Some(ref slab_id) = gst_slab_id {
            if let Some(slab) = crate::commands::tax_utils::get_slab(pool.inner(), slab_id).await {
                effective_rate = crate::commands::tax_utils::resolve_effective_rate(item.rate, &slab);
            }
        }
        
        let raw_amount = final_quantity * item.rate;
        let discount_percent = item.discount_percent.unwrap_or(0.0);
        let discount_amount = if discount_percent > 0.0 { raw_amount * (discount_percent / 100.0) } else { item.discount_amount.unwrap_or(0.0) };
        let net_before_tax = raw_amount - discount_amount;
        
        let (taxable_amount, tax_amount, base_amount, base_rate) = if tax_inclusive {
            let tax_amt = net_before_tax - (net_before_tax / (1.0 + (effective_rate / 100.0)));
            let txbl = net_before_tax - tax_amt;
            let b_amt = txbl + discount_amount;
            (txbl, tax_amt, b_amt, b_amt / final_quantity)
        } else {
            (net_before_tax, net_before_tax * (effective_rate / 100.0), raw_amount, item.rate)
        };
        
        subtotal += taxable_amount;
        
        let mut cgst_rate = 0.0; let mut sgst_rate = 0.0; let mut igst_rate = 0.0;
        let mut cgst_amount = 0.0; let mut sgst_amount = 0.0; let mut igst_amount = 0.0;
        if effective_rate > 0.0 {
            let split = crate::commands::tax_utils::compute_split(taxable_amount, effective_rate, is_inter_state);
            cgst_rate = split.cgst_rate; sgst_rate = split.sgst_rate; igst_rate = split.igst_rate;
            cgst_amount = split.cgst_amount; sgst_amount = split.sgst_amount; igst_amount = split.igst_amount;
            total_cgst += cgst_amount; total_sgst += sgst_amount; total_igst += igst_amount;
        }

        use uuid::Uuid;
        processed_items.push(ProcessedVoucherItem {
            id: Uuid::now_v7().to_string(),
            product_id: item.product_id.clone(), description: item.description.clone(), initial_quantity: item.initial_quantity,
            count: item.count, deduction_per_unit: item.deduction_per_unit, final_quantity, unit_id: unit_snapshot.unit_id,
            base_quantity: unit_snapshot.base_quantity, rate: base_rate, amount: base_amount, discount_percent, discount_amount,
            tax_rate: effective_rate, tax_amount, remarks: item.remarks.clone(), cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
            hsn_sac_code, gst_slab_id, resolved_gst_rate: effective_rate,
        });
    }

    let discount_amount = invoice.discount_amount.unwrap_or(0.0);
    let total_amount = subtotal - discount_amount;

__VOUCHER_DB_ACTIONS__

    // Insert items
    for item in &processed_items {
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, tax_rate, tax_amount, discount_percent, discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item.id).bind(&voucher_id).bind(&item.product_id).bind(&item.description).bind(item.initial_quantity)
        .bind(item.count).bind(item.deduction_per_unit).bind(item.final_quantity).bind(&item.unit_id).bind(item.base_quantity)
        .bind(item.rate).bind(item.amount).bind(item.tax_rate).bind(item.tax_amount).bind(item.discount_percent).bind(item.discount_amount)
        .bind(&item.remarks).bind(item.cgst_rate).bind(item.sgst_rate).bind(item.igst_rate).bind(item.cgst_amount).bind(item.sgst_amount)
        .bind(item.igst_amount).bind(&item.hsn_sac_code).bind(&item.gst_slab_id).bind(item.resolved_gst_rate)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= CREATE JOURNAL ENTRIES =============

__CLEAR_OLD_JES__

    let party_id = invoice.__PARTY_ID__;
    
    let total_tax = total_cgst + total_sgst + total_igst;

    let main_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = 'M_CODE'").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    
    // Group tax manually
    let mut tax_ledgers: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    for row in &processed_items {
        if row.tax_amount > 0.0 {
            let accounts = crate::commands::tax_utils::resolve_gst_account_names(row.resolved_gst_rate, is_inter_state, IS_PURCHASE);
            if let Some(cgst_acc) = accounts.cgst_account {
                *tax_ledgers.entry(cgst_acc).or_insert(0.0) += row.cgst_amount;
            }
            if let Some(sgst_acc) = accounts.sgst_account {
                *tax_ledgers.entry(sgst_acc).or_insert(0.0) += row.sgst_amount;
            }
            if let Some(igst_acc) = accounts.igst_account {
                *tax_ledgers.entry(igst_acc).or_insert(0.0) += row.igst_amount;
            }
        }
    }

    use uuid::Uuid;

    // Party entry
__PARTY_ENTRY__

    // Main entry
__MAIN_ENTRY__

    // Discount entry
__DISCOUNT_ENTRY__

    // Tax entries
    for (acc_name, amt) in tax_ledgers {
        if amt > 0.0 {
            let acc_id = crate::commands::tax_utils::ensure_gst_account_exists(pool.inner(), &acc_name, !IS_PURCHASE).await?;
            let (dr, cr) = if IS_PURCHASE { (amt, 0.0) } else { (0.0, amt) };
            
            sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)")
                .bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(acc_id).bind(dr).bind(cr)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id.to_string())
}
"""
        
        # Replace placeholders
        
        if not is_update:
            func_def_sales = "pub async fn create_sales_invoice(\n    pool: tauri::State<'_, sqlx::SqlitePool>,\n    invoice: CreateSalesInvoice,\n) -> Result<String, String> {"
            func_def_purchase = "pub async fn create_purchase_invoice(\n    pool: tauri::State<'_, sqlx::SqlitePool>,\n    invoice: CreatePurchaseInvoice,\n) -> Result<String, String> {"
            func_def = func_def_purchase if is_purchase else func_def_sales
            
            voucher_no_logic = f'    let voucher_no = crate::voucher_seq::get_next_voucher_number(pool.inner(), "{invoice_type}").await?;'
            
            if is_purchase:
                voucher_db = """    use uuid::Uuid;
    let voucher_id = Uuid::now_v7().to_string();
    let _ = sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, tax_amount, total_amount, narration, status, created_by, tax_inclusive, cgst_amount, sgst_amount, igst_amount, grand_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?)"
    )
    .bind(&voucher_id).bind(&voucher_no).bind("purchase_invoice").bind(&invoice.voucher_date).bind(&invoice.supplier_id)
    .bind(&invoice.party_type).bind(&invoice.reference).bind(subtotal).bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount).bind(total_cgst + total_sgst + total_igst).bind(total_amount).bind(&invoice.narration)
    .bind(&invoice.user_id).bind(tax_inclusive as i64).bind(total_cgst).bind(total_sgst).bind(total_igst)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;"""
            else:
                voucher_db = """    use uuid::Uuid;
    let voucher_id = Uuid::now_v7().to_string();
    let _ = sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, salesperson_id, party_type, reference, subtotal, discount_rate, discount_amount, tax_amount, total_amount, narration, status, created_by, tax_inclusive, cgst_amount, sgst_amount, igst_amount, grand_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?)"
    )
    .bind(&voucher_id).bind(&voucher_no).bind("sales_invoice").bind(&invoice.voucher_date).bind(&invoice.customer_id)
    .bind(&invoice.salesperson_id).bind(&invoice.party_type).bind(&invoice.reference).bind(subtotal).bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount).bind(total_cgst + total_sgst + total_igst).bind(total_amount).bind(&invoice.narration)
    .bind(&invoice.user_id).bind(tax_inclusive as i64).bind(total_cgst).bind(total_sgst).bind(total_igst)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;"""
            
            clear_old = ""
        else:
            func_def_sales = "pub async fn update_sales_invoice(\n    pool: tauri::State<'_, sqlx::SqlitePool>,\n    id: String,\n    invoice: CreateSalesInvoice,\n) -> Result<String, String> {"
            func_def_purchase = "pub async fn update_purchase_invoice(\n    pool: tauri::State<'_, sqlx::SqlitePool>,\n    id: String,\n    invoice: CreatePurchaseInvoice,\n) -> Result<String, String> {"
            func_def = func_def_purchase if is_purchase else func_def_sales
            
            voucher_no_logic = ""
            
            if is_purchase:
                voucher_db = """    let voucher_id = id;
    let _ = sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, party_type = ?, reference = ?, subtotal = ?, 
             discount_rate = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, narration = ?,
             tax_inclusive = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?
         WHERE id = ?"
    )
    .bind(&invoice.voucher_date).bind(&invoice.supplier_id).bind(&invoice.party_type).bind(&invoice.reference)
    .bind(subtotal).bind(invoice.discount_rate.unwrap_or(0.0)).bind(discount_amount)
    .bind(total_cgst + total_sgst + total_igst).bind(total_amount).bind(&invoice.narration)
    .bind(tax_inclusive as i64).bind(total_cgst).bind(total_sgst).bind(total_igst).bind(&voucher_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?").bind(&voucher_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;"""
            else:
                voucher_db = """    let voucher_id = id;
    let _ = sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, salesperson_id = ?, party_type = ?, reference = ?, subtotal = ?, 
             discount_rate = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, narration = ?,
             tax_inclusive = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?
         WHERE id = ?"
    )
    .bind(&invoice.voucher_date).bind(&invoice.customer_id).bind(&invoice.salesperson_id).bind(&invoice.party_type).bind(&invoice.reference)
    .bind(subtotal).bind(invoice.discount_rate.unwrap_or(0.0)).bind(discount_amount)
    .bind(total_cgst + total_sgst + total_igst).bind(total_amount).bind(&invoice.narration)
    .bind(tax_inclusive as i64).bind(total_cgst).bind(total_sgst).bind(total_igst).bind(&voucher_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?").bind(&voucher_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;"""
                
            clear_old = '    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?").bind(&voucher_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;'
            
        if is_purchase:
            party_entry = '    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&party_id).bind(0.0).bind(total_amount + total_tax).execute(&mut *tx).await.map_err(|e| e.to_string())?;'
            main_entry = '    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&main_account).bind(subtotal).bind(0.0).execute(&mut *tx).await.map_err(|e| e.to_string())?;'
            discount_entry = f'''    if discount_amount > 0.0 {{
        let dis_acc: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = {discount_account_code}").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(dis_acc).bind(0.0).bind(discount_amount).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }}'''
        else:
            party_entry = '    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&party_id).bind(total_amount + total_tax).bind(0.0).execute(&mut *tx).await.map_err(|e| e.to_string())?;'
            main_entry = '    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&main_account).bind(0.0).bind(subtotal).execute(&mut *tx).await.map_err(|e| e.to_string())?;'
            discount_entry = f'''    if discount_amount > 0.0 {{
        let dis_acc: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = {discount_account_code}").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(dis_acc).bind(discount_amount).bind(0.0).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }}'''

        is_purchase_str = "true" if is_purchase else "false"

        res = template.replace("__FUNC_DEF__", func_def)
        res = res.replace("__VOUCHER_NO_LOGIC__", voucher_no_logic)
        res = res.replace("__PARTY_ID__", party_id_field)
        res = res.replace("__UNIT_KIND__", unit_kind)
        res = res.replace("__VOUCHER_DB_ACTIONS__", voucher_db)
        res = res.replace("__CLEAR_OLD_JES__", clear_old)
        res = res.replace("M_CODE", main_account_code.replace("'", ""))
        res = res.replace("IS_PURCHASE", is_purchase_str)
        res = res.replace("__PARTY_ENTRY__", party_entry)
        res = res.replace("__MAIN_ENTRY__", main_entry)
        res = res.replace("__DISCOUNT_ENTRY__", discount_entry)

        return res


    s_c, e_c = extract_function("create_purchase_invoice")
    if s_c != -1: content = content[:s_c] + make_body("purchase", "create") + "\n" + content[e_c:]
    
    s_c, e_c = extract_function("update_purchase_invoice")
    if s_c != -1: content = content[:s_c] + make_body("purchase", "update") + "\n" + content[e_c:]

    s_c, e_c = extract_function("create_sales_invoice")
    if s_c != -1: content = content[:s_c] + make_body("sales", "create") + "\n" + content[e_c:]

    s_c, e_c = extract_function("update_sales_invoice")
    if s_c != -1: content = content[:s_c] + make_body("sales", "update") + "\n" + content[e_c:]

    with open('src-tauri/src/commands/invoices.rs', 'w', encoding='utf-8') as f:
        f.write(content)

process_file()
print("Refactored invoices.rs")
