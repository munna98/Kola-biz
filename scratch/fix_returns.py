import os
import re

def fix_returns_file(filename, voucher_type):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # Apply tax_inclusive typo fix immediately
    content = content.replace("v.is_tax_inclusive", "v.tax_inclusive")
    content = content.replace("pub is_tax_inclusive:", "pub tax_inclusive:")
    
    # Pre-calculate total tax before SQL inserts
    p = r'(let total_amount = subtotal - discount_amount;\s*)(// Create voucher|let voucher_id = id;)'
    
    tax_calc = """\\1
    let mut total_tax = 0.0;
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        let discount_amount = if item.discount_percent.unwrap_or(0.0) > 0.0 { amount * (item.discount_percent.unwrap_or(0.0) / 100.0) } else { item.discount_amount.unwrap_or(0.0) };
        let taxable_amount = amount - discount_amount;
        let tax_amount = taxable_amount * (item.tax_rate / 100.0);
        total_tax += tax_amount;
    }
    let grand_total = total_amount + total_tax;
    let tax_inclusive = invoice.tax_inclusive.unwrap_or(false);
    
    \\2"""
    content = re.sub(p, tax_calc, content)

    # Insert
    if voucher_type == 'purchase_return':
        content = content.replace(
        '''"INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, total_amount, narration, status)
         VALUES (?, ?, 'purchase_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted')"''',
        '''"INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, tax_amount, total_amount, narration, status, tax_inclusive, grand_total)
         VALUES (?, ?, 'purchase_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)"'''
        )
        content = content.replace(
        '''.bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)''',
        '''.bind(discount_amount)
    .bind(total_tax)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(tax_inclusive as i64)
    .bind(grand_total)'''
        )
        # Update
        content = content.replace(
        '''"UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, total_amount = ?, narration = ?, status = 'posted'
         WHERE id = ? AND voucher_type = 'purchase_return'"''',
        '''"UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, narration = ?, status = 'posted', tax_inclusive = ?, grand_total = ?
         WHERE id = ? AND voucher_type = 'purchase_return'"'''
        )
        content = content.replace(
        '''.bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(&id)''',
        '''.bind(discount_amount)
    .bind(total_tax)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(tax_inclusive as i64)
    .bind(grand_total)
    .bind(&id)'''
        )
        
    else:  # sales_return
        content = content.replace(
        '''"INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, salesperson_id, party_type, reference, subtotal, discount_rate, discount_amount, total_amount, narration, status)
         VALUES (?, ?, 'sales_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted')"''',
        '''"INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, salesperson_id, party_type, reference, subtotal, discount_rate, discount_amount, tax_amount, total_amount, narration, status, tax_inclusive, grand_total)
         VALUES (?, ?, 'sales_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)"'''
        )
        # Binds
        content = content.replace(
        '''.bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)''',
        '''.bind(discount_amount)
    .bind(total_tax)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(tax_inclusive as i64)
    .bind(grand_total)'''
        )
        # Update
        content = content.replace(
        '''"UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, salesperson_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, total_amount = ?, narration = ?, status = 'posted'
         WHERE id = ? AND voucher_type = 'sales_return'"''',
        '''"UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, salesperson_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, narration = ?, status = 'posted', tax_inclusive = ?, grand_total = ?
         WHERE id = ? AND voucher_type = 'sales_return'"'''
        )
        content = content.replace(
        '''.bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(&id)''',
        '''.bind(discount_amount)
    .bind(total_tax)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(tax_inclusive as i64)
    .bind(grand_total)
    .bind(&id)'''
        )

    # SELECT Queries Fix
    content = content.replace(
        "v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,",
        "v.grand_total,"
    )

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

fix_returns_file('src-tauri/src/commands/purchase_returns.rs', 'purchase_return')
fix_returns_file('src-tauri/src/commands/sales_returns.rs', 'sales_return')
print("Fixed returns files.")
