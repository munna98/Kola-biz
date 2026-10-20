use dirs::download_dir;
use printpdf::*;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LedgerPdfEntry {
    pub date: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub narration: String,
    pub debit: f64,
    pub credit: f64,
    pub balance: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LedgerPdfData {
    pub account_code: String,
    pub account_name: String,
    pub period_from: String,
    pub period_to: String,
    pub opening_balance: f64,
    pub closing_balance: f64,
    pub currency_code: Option<String>,
    pub currency_symbol: Option<String>,
    pub currency_display: Option<String>,
    pub entries: Vec<LedgerPdfEntry>,
}

fn format_voucher_type(vtype: &str) -> String {
    vtype
        .split('_')
        .map(|word| {
            let mut c = word.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_pdf_currency(amount: f64, data: &LedgerPdfData) -> String {
    let value = format!("{:.2}", amount);
    match data.currency_display.as_deref().unwrap_or("symbol") {
        "code" => format!(
            "{} {}",
            data.currency_code.as_deref().unwrap_or("INR"),
            value
        ),
        "none" => value,
        _ => {
            let symbol = data.currency_symbol.as_deref().unwrap_or("");
            if symbol.is_empty() {
                value
            } else {
                format!("{} {}", symbol, value)
            }
        }
    }
}

#[tauri::command]
pub fn get_downloads_path() -> Result<String, String> {
    download_dir()
        .ok_or_else(|| "Could not find downloads directory".to_string())
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn generate_ledger_pdf(data: LedgerPdfData, file_path: String) -> Result<String, String> {
    let output_path = PathBuf::from(&file_path);

    // Create PDF document with A4 size
    let (document, page1, layer1) =
        PdfDocument::new("Ledger Report", Mm(210.0), Mm(297.0), "Layer 1");
    let font = document
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;
    let font_bold = document
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;

    let mut current_layer = document.get_page(page1).get_layer(layer1);

    // Margins
    let left_margin = 12.0;
    let top_margin = 280.0;
    let mut y_pos = top_margin;

    // Title
    current_layer.use_text(
        "LEDGER REPORT",
        24.0,
        Mm(left_margin),
        Mm(y_pos),
        &font_bold,
    );
    y_pos -= 8.0;

    // Account Information
    let account_info = format!("{} - {}", data.account_code, data.account_name);
    current_layer.use_text(&account_info, 12.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 5.0;

    // Period Information
    let period_info = format!("Period: {} to {}", data.period_from, data.period_to);
    current_layer.use_text(&period_info, 9.0, Mm(left_margin), Mm(y_pos), &font);
    y_pos -= 6.0;

    // Table configuration - optimized for full page width (186mm available with 12mm margins)
    let col_widths = [21.0, 23.0, 18.0, 50.0, 23.0, 23.0, 28.0];
    let mut col_x = vec![left_margin];
    for width in &col_widths[0..col_widths.len() - 1] {
        col_x.push(col_x.last().unwrap() + width);
    }

    let headers = vec![
        "Date",
        "Voucher No",
        "Type",
        "Narration",
        "Debit",
        "Credit",
        "Balance",
    ];
    let line_height = 5.0;
    let cell_padding = 0.8;

    // Draw header text
    for (i, header) in headers.iter().enumerate() {
        current_layer.use_text(
            *header,
            9.0,
            Mm(col_x[i] + cell_padding),
            Mm(y_pos),
            &font_bold,
        );
    }
    y_pos -= line_height;
    y_pos -= 1.0;

    // Opening Balance Row
    if data.opening_balance.abs() > 0.01 {
        current_layer.use_text(
            "Opening Balance",
            8.0,
            Mm(col_x[0] + cell_padding),
            Mm(y_pos),
            &font_bold,
        );

        let balance_str = format_pdf_currency(data.opening_balance.abs(), &data);
        let dr_cr = if data.opening_balance >= 0.0 {
            "Dr"
        } else {
            "Cr"
        };
        current_layer.use_text(
            &format!("{} {}", balance_str, dr_cr),
            8.0,
            Mm(col_x[6] + cell_padding),
            Mm(y_pos),
            &font_bold,
        );
        y_pos -= line_height;
    }

    // Data Entries
    for entry in &data.entries {
        if y_pos < 25.0 {
            // Create new page if needed
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;

            // Repeat headers on new page
            for (i, header) in headers.iter().enumerate() {
                current_layer.use_text(
                    *header,
                    9.0,
                    Mm(col_x[i] + cell_padding),
                    Mm(y_pos),
                    &font_bold,
                );
            }
            y_pos -= line_height;
            y_pos -= 1.0;
        }

        // Date
        current_layer.use_text(
            &entry.date,
            7.5,
            Mm(col_x[0] + cell_padding),
            Mm(y_pos),
            &font,
        );

        // Voucher No
        current_layer.use_text(
            &entry.voucher_no,
            7.5,
            Mm(col_x[1] + cell_padding),
            Mm(y_pos),
            &font,
        );

        // Type
        let formatted_type = format_voucher_type(&entry.voucher_type);
        current_layer.use_text(
            &formatted_type,
            7.5,
            Mm(col_x[2] + cell_padding),
            Mm(y_pos),
            &font,
        );

        // Narration (truncate if too long)
        let narration = if entry.narration.len() > 25 {
            format!("{}...", &entry.narration[..22])
        } else {
            entry.narration.clone()
        };
        current_layer.use_text(
            &narration,
            7.5,
            Mm(col_x[3] + cell_padding),
            Mm(y_pos),
            &font,
        );

        // Debit (right-aligned)
        if entry.debit > 0.01 {
            let debit_text = format!("{:>12.2}", entry.debit);
            current_layer.use_text(
                &debit_text,
                7.5,
                Mm(col_x[4] + cell_padding),
                Mm(y_pos),
                &font,
            );
        }

        // Credit (right-aligned)
        if entry.credit > 0.01 {
            let credit_text = format!("{:>12.2}", entry.credit);
            current_layer.use_text(
                &credit_text,
                7.5,
                Mm(col_x[5] + cell_padding),
                Mm(y_pos),
                &font,
            );
        }

        // Balance
        let balance_str = format!(
            "{} {}",
            format_pdf_currency(entry.balance.abs(), &data),
            if entry.balance >= 0.0 { "Dr" } else { "Cr" }
        );
        current_layer.use_text(&balance_str, 7.5, Mm(col_x[6] + cell_padding), Mm(y_pos), &font);

        y_pos -= line_height;
    }

    // Closing Balance Row
    y_pos -= 2.0;
    if y_pos < 25.0 {
        let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
        current_layer = document.get_page(page).get_layer(layer);
        y_pos = top_margin - 15.0;

        for (i, header) in headers.iter().enumerate() {
            current_layer.use_text(
                *header,
                9.0,
                Mm(col_x[i] + cell_padding),
                Mm(y_pos),
                &font_bold,
            );
        }
        y_pos -= line_height;
        y_pos -= 1.0;
    }

    current_layer.use_text(
        "Closing Balance",
        9.0,
        Mm(col_x[0] + cell_padding),
        Mm(y_pos),
        &font_bold,
    );

    let closing_str = format_pdf_currency(data.closing_balance.abs(), &data);
    let dr_cr = if data.closing_balance >= 0.0 {
        "Dr"
    } else {
        "Cr"
    };
    current_layer.use_text(
        &format!("{} {}", closing_str, dr_cr),
        9.0,
        Mm(col_x[6] + cell_padding),
        Mm(y_pos),
        &font_bold,
    );

    // Save PDF
    document
        .save(&mut BufWriter::new(
            File::create(&output_path).map_err(|e| e.to_string())?,
        ))
        .map_err(|e| e.to_string())?;

    Ok(output_path.to_string_lossy().to_string())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PdfAccountRow {
    pub account_code: String,
    pub account_name: String,
    pub account_group: String,
    pub amount: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BalanceSheetPdfData {
    pub company_name: String,
    pub as_on_date: String,
    pub total_assets: f64,
    pub total_liabilities: f64,
    pub total_equity: f64,
    pub currency_symbol: Option<String>,
    pub assets: Vec<PdfAccountRow>,
    pub liabilities: Vec<PdfAccountRow>,
    pub equity: Vec<PdfAccountRow>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProfitLossPdfData {
    pub company_name: String,
    pub period_from: String,
    pub period_to: String,
    pub opening_stock: f64,
    pub purchases: f64,
    pub closing_stock: f64,
    pub cogs: f64,
    pub total_income: f64,
    pub total_expenses: f64,
    pub gross_profit: f64,
    pub net_profit: f64,
    pub currency_symbol: Option<String>,
    pub income_items: Vec<PdfAccountRow>,
    pub expense_items: Vec<PdfAccountRow>,
}

#[tauri::command]
pub async fn generate_balance_sheet_pdf(
    data: BalanceSheetPdfData,
    file_path: String,
) -> Result<String, String> {
    let output_path = PathBuf::from(&file_path);

    let (document, page1, layer1) =
        PdfDocument::new("Balance Sheet", Mm(210.0), Mm(297.0), "Layer 1");
    let font = document
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;
    let font_bold = document
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;

    let mut current_layer = document.get_page(page1).get_layer(layer1);

    let left_margin = 12.0;
    let top_margin = 280.0;
    let mut y_pos = top_margin;

    // Header
    current_layer.use_text(&data.company_name, 16.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 7.0;

    current_layer.use_text("BALANCE SHEET", 20.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    let period_info = format!("As on {}", data.as_on_date);
    current_layer.use_text(&period_info, 9.0, Mm(left_margin), Mm(y_pos), &font);
    y_pos -= 8.0;

    let currency_sym = data.currency_symbol.as_deref().unwrap_or("");
    let col_x = [left_margin, left_margin + 25.0, left_margin + 110.0, left_margin + 155.0];
    let line_height = 5.0;

    // 1. ASSETS
    current_layer.use_text("ASSETS", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    current_layer.use_text("Code", 8.5, Mm(col_x[0]), Mm(y_pos), &font_bold);
    current_layer.use_text("Particulars / Account Name", 8.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
    current_layer.use_text("Account Group", 8.5, Mm(col_x[2]), Mm(y_pos), &font_bold);
    current_layer.use_text("Amount", 8.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
    y_pos -= line_height;

    for item in &data.assets {
        if y_pos < 25.0 {
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;
            current_layer.use_text("Code", 8.5, Mm(col_x[0]), Mm(y_pos), &font_bold);
            current_layer.use_text("Particulars / Account Name", 8.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
            current_layer.use_text("Account Group", 8.5, Mm(col_x[2]), Mm(y_pos), &font_bold);
            current_layer.use_text("Amount", 8.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
            y_pos -= line_height;
        }

        current_layer.use_text(&item.account_code, 8.0, Mm(col_x[0]), Mm(y_pos), &font);
        let name = if item.account_name.len() > 40 {
            format!("{}...", &item.account_name[..37])
        } else {
            item.account_name.clone()
        };
        current_layer.use_text(&name, 8.0, Mm(col_x[1]), Mm(y_pos), &font);
        current_layer.use_text(&item.account_group, 8.0, Mm(col_x[2]), Mm(y_pos), &font);
        let amt_str = format!("{} {:.2}", currency_sym, item.amount);
        current_layer.use_text(&amt_str, 8.0, Mm(col_x[3]), Mm(y_pos), &font);
        y_pos -= line_height;
    }

    y_pos -= 2.0;
    current_layer.use_text("TOTAL ASSETS", 9.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
    let total_assets_str = format!("{} {:.2}", currency_sym, data.total_assets);
    current_layer.use_text(&total_assets_str, 9.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
    y_pos -= 9.0;

    // 2. LIABILITIES
    if y_pos < 35.0 {
        let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
        current_layer = document.get_page(page).get_layer(layer);
        y_pos = top_margin - 15.0;
    }
    current_layer.use_text("LIABILITIES", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    current_layer.use_text("Code", 8.5, Mm(col_x[0]), Mm(y_pos), &font_bold);
    current_layer.use_text("Particulars / Account Name", 8.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
    current_layer.use_text("Account Group", 8.5, Mm(col_x[2]), Mm(y_pos), &font_bold);
    current_layer.use_text("Amount", 8.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
    y_pos -= line_height;

    for item in &data.liabilities {
        if y_pos < 25.0 {
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;
            current_layer.use_text("Code", 8.5, Mm(col_x[0]), Mm(y_pos), &font_bold);
            current_layer.use_text("Particulars / Account Name", 8.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
            current_layer.use_text("Account Group", 8.5, Mm(col_x[2]), Mm(y_pos), &font_bold);
            current_layer.use_text("Amount", 8.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
            y_pos -= line_height;
        }

        current_layer.use_text(&item.account_code, 8.0, Mm(col_x[0]), Mm(y_pos), &font);
        let name = if item.account_name.len() > 40 {
            format!("{}...", &item.account_name[..37])
        } else {
            item.account_name.clone()
        };
        current_layer.use_text(&name, 8.0, Mm(col_x[1]), Mm(y_pos), &font);
        current_layer.use_text(&item.account_group, 8.0, Mm(col_x[2]), Mm(y_pos), &font);
        let amt_str = format!("{} {:.2}", currency_sym, item.amount);
        current_layer.use_text(&amt_str, 8.0, Mm(col_x[3]), Mm(y_pos), &font);
        y_pos -= line_height;
    }

    y_pos -= 2.0;
    current_layer.use_text("TOTAL LIABILITIES", 9.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
    let total_liab_str = format!("{} {:.2}", currency_sym, data.total_liabilities);
    current_layer.use_text(&total_liab_str, 9.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
    y_pos -= 9.0;

    // 3. CAPITAL & EQUITY
    if y_pos < 35.0 {
        let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
        current_layer = document.get_page(page).get_layer(layer);
        y_pos = top_margin - 15.0;
    }
    current_layer.use_text("CAPITAL & EQUITY", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    current_layer.use_text("Code", 8.5, Mm(col_x[0]), Mm(y_pos), &font_bold);
    current_layer.use_text("Particulars / Account Name", 8.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
    current_layer.use_text("Account Group", 8.5, Mm(col_x[2]), Mm(y_pos), &font_bold);
    current_layer.use_text("Amount", 8.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
    y_pos -= line_height;

    for item in &data.equity {
        if y_pos < 25.0 {
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;
            current_layer.use_text("Code", 8.5, Mm(col_x[0]), Mm(y_pos), &font_bold);
            current_layer.use_text("Particulars / Account Name", 8.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
            current_layer.use_text("Account Group", 8.5, Mm(col_x[2]), Mm(y_pos), &font_bold);
            current_layer.use_text("Amount", 8.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
            y_pos -= line_height;
        }

        current_layer.use_text(&item.account_code, 8.0, Mm(col_x[0]), Mm(y_pos), &font);
        let name = if item.account_name.len() > 40 {
            format!("{}...", &item.account_name[..37])
        } else {
            item.account_name.clone()
        };
        current_layer.use_text(&name, 8.0, Mm(col_x[1]), Mm(y_pos), &font);
        current_layer.use_text(&item.account_group, 8.0, Mm(col_x[2]), Mm(y_pos), &font);
        let amt_str = format!("{} {:.2}", currency_sym, item.amount);
        current_layer.use_text(&amt_str, 8.0, Mm(col_x[3]), Mm(y_pos), &font);
        y_pos -= line_height;
    }

    y_pos -= 2.0;
    current_layer.use_text("TOTAL CAPITAL & EQUITY", 9.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
    let total_eq_str = format!("{} {:.2}", currency_sym, data.total_equity);
    current_layer.use_text(&total_eq_str, 9.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
    y_pos -= 9.0;

    // Balance Sheet Verification Footer
    if y_pos < 30.0 {
        let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
        current_layer = document.get_page(page).get_layer(layer);
        y_pos = top_margin - 15.0;
    }

    let total_liab_eq = data.total_liabilities + data.total_equity;
    let diff = (data.total_assets - total_liab_eq).abs();
    let is_balanced = diff < 0.01;

    current_layer.use_text("TOTAL LIABILITIES & EQUITY", 10.0, Mm(col_x[1]), Mm(y_pos), &font_bold);
    let total_liab_eq_str = format!("{} {:.2}", currency_sym, total_liab_eq);
    current_layer.use_text(&total_liab_eq_str, 10.0, Mm(col_x[3]), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    let status_str = if is_balanced {
        "STATUS: BALANCED".to_string()
    } else {
        format!("STATUS: UNBALANCED (Diff: {} {:.2})", currency_sym, diff)
    };
    current_layer.use_text(&status_str, 10.0, Mm(left_margin), Mm(y_pos), &font_bold);

    document
        .save(&mut BufWriter::new(
            File::create(&output_path).map_err(|e| e.to_string())?,
        ))
        .map_err(|e| e.to_string())?;

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn generate_profit_loss_pdf(
    data: ProfitLossPdfData,
    file_path: String,
) -> Result<String, String> {
    let output_path = PathBuf::from(&file_path);

    let (document, page1, layer1) =
        PdfDocument::new("Profit & Loss Statement", Mm(210.0), Mm(297.0), "Layer 1");
    let font = document
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;
    let font_bold = document
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;

    let mut current_layer = document.get_page(page1).get_layer(layer1);

    let left_margin = 12.0;
    let top_margin = 280.0;
    let mut y_pos = top_margin;

    // Header
    current_layer.use_text(&data.company_name, 16.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 7.0;

    current_layer.use_text("PROFIT & LOSS STATEMENT", 20.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    let period_info = format!("Period: {} to {}", data.period_from, data.period_to);
    current_layer.use_text(&period_info, 9.0, Mm(left_margin), Mm(y_pos), &font);
    y_pos -= 8.0;

    let currency_sym = data.currency_symbol.as_deref().unwrap_or("");
    let line_height = 5.0;

    // 1. TRADING ACCOUNT SUMMARY
    current_layer.use_text("1. TRADING ACCOUNT SUMMARY", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    let trading_items = vec![
        ("Opening Stock", data.opening_stock),
        ("Purchases & Direct Expenses", data.purchases),
        ("Revenue / Operations (Sales)", data.total_income),
        ("Closing Stock", data.closing_stock),
        ("Cost of Goods Sold (COGS)", data.cogs),
    ];

    for (label, val) in trading_items {
        current_layer.use_text(label, 8.5, Mm(left_margin + 5.0), Mm(y_pos), &font);
        let val_str = format!("{} {:.2}", currency_sym, val);
        current_layer.use_text(&val_str, 8.5, Mm(left_margin + 120.0), Mm(y_pos), &font);
        y_pos -= line_height;
    }

    y_pos -= 2.0;
    let gp_label = if data.gross_profit >= 0.0 { "GROSS PROFIT" } else { "GROSS LOSS" };
    current_layer.use_text(gp_label, 10.0, Mm(left_margin + 5.0), Mm(y_pos), &font_bold);
    let gp_str = format!("{} {:.2}", currency_sym, data.gross_profit.abs());
    current_layer.use_text(&gp_str, 10.0, Mm(left_margin + 120.0), Mm(y_pos), &font_bold);
    y_pos -= 8.0;

    // 2. PROFIT & LOSS SUMMARY
    current_layer.use_text("2. PROFIT & LOSS SUMMARY", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    let pl_summary_items = vec![
        (if data.gross_profit >= 0.0 { "Gross Profit b/f" } else { "Gross Loss b/f" }, data.gross_profit.abs()),
        ("Operating / Indirect Expenses", data.total_expenses),
    ];

    for (label, val) in pl_summary_items {
        current_layer.use_text(label, 8.5, Mm(left_margin + 5.0), Mm(y_pos), &font);
        let val_str = format!("{} {:.2}", currency_sym, val);
        current_layer.use_text(&val_str, 8.5, Mm(left_margin + 120.0), Mm(y_pos), &font);
        y_pos -= line_height;
    }

    y_pos -= 2.0;
    let np_label = if data.net_profit >= 0.0 { "NET PROFIT" } else { "NET LOSS" };
    current_layer.use_text(np_label, 10.5, Mm(left_margin + 5.0), Mm(y_pos), &font_bold);
    let np_str = format!("{} {:.2}", currency_sym, data.net_profit.abs());
    current_layer.use_text(&np_str, 10.5, Mm(left_margin + 120.0), Mm(y_pos), &font_bold);
    y_pos -= 10.0;

    // 3. DETAILED ACCOUNT BREAKDOWN
    let col_x = [left_margin, left_margin + 25.0, left_margin + 110.0, left_margin + 155.0];

    // Income Accounts
    if !data.income_items.is_empty() {
        if y_pos < 35.0 {
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;
        }

        current_layer.use_text("DETAILED REVENUE / INCOME ACCOUNTS", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
        y_pos -= 6.0;

        current_layer.use_text("Code", 8.5, Mm(col_x[0]), Mm(y_pos), &font_bold);
        current_layer.use_text("Particulars / Account Name", 8.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
        current_layer.use_text("Account Group", 8.5, Mm(col_x[2]), Mm(y_pos), &font_bold);
        current_layer.use_text("Amount", 8.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
        y_pos -= line_height;

        for item in &data.income_items {
            if y_pos < 25.0 {
                let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
                current_layer = document.get_page(page).get_layer(layer);
                y_pos = top_margin - 15.0;
                current_layer.use_text("Code", 8.5, Mm(col_x[0]), Mm(y_pos), &font_bold);
                current_layer.use_text("Particulars / Account Name", 8.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
                current_layer.use_text("Account Group", 8.5, Mm(col_x[2]), Mm(y_pos), &font_bold);
                current_layer.use_text("Amount", 8.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
                y_pos -= line_height;
            }

            current_layer.use_text(&item.account_code, 8.0, Mm(col_x[0]), Mm(y_pos), &font);
            let name = if item.account_name.len() > 40 {
                format!("{}...", &item.account_name[..37])
            } else {
                item.account_name.clone()
            };
            current_layer.use_text(&name, 8.0, Mm(col_x[1]), Mm(y_pos), &font);
            current_layer.use_text(&item.account_group, 8.0, Mm(col_x[2]), Mm(y_pos), &font);
            let amt_str = format!("{} {:.2}", currency_sym, item.amount);
            current_layer.use_text(&amt_str, 8.0, Mm(col_x[3]), Mm(y_pos), &font);
            y_pos -= line_height;
        }
        y_pos -= 6.0;
    }

    // Expense Accounts
    if !data.expense_items.is_empty() {
        if y_pos < 35.0 {
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;
        }

        current_layer.use_text("DETAILED EXPENSE ACCOUNTS", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
        y_pos -= 6.0;

        current_layer.use_text("Code", 8.5, Mm(col_x[0]), Mm(y_pos), &font_bold);
        current_layer.use_text("Particulars / Account Name", 8.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
        current_layer.use_text("Account Group", 8.5, Mm(col_x[2]), Mm(y_pos), &font_bold);
        current_layer.use_text("Amount", 8.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
        y_pos -= line_height;

        for item in &data.expense_items {
            if y_pos < 25.0 {
                let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
                current_layer = document.get_page(page).get_layer(layer);
                y_pos = top_margin - 15.0;
                current_layer.use_text("Code", 8.5, Mm(col_x[0]), Mm(y_pos), &font_bold);
                current_layer.use_text("Particulars / Account Name", 8.5, Mm(col_x[1]), Mm(y_pos), &font_bold);
                current_layer.use_text("Account Group", 8.5, Mm(col_x[2]), Mm(y_pos), &font_bold);
                current_layer.use_text("Amount", 8.5, Mm(col_x[3]), Mm(y_pos), &font_bold);
                y_pos -= line_height;
            }

            current_layer.use_text(&item.account_code, 8.0, Mm(col_x[0]), Mm(y_pos), &font);
            let name = if item.account_name.len() > 40 {
                format!("{}...", &item.account_name[..37])
            } else {
                item.account_name.clone()
            };
            current_layer.use_text(&name, 8.0, Mm(col_x[1]), Mm(y_pos), &font);
            current_layer.use_text(&item.account_group, 8.0, Mm(col_x[2]), Mm(y_pos), &font);
            let amt_str = format!("{} {:.2}", currency_sym, item.amount);
            current_layer.use_text(&amt_str, 8.0, Mm(col_x[3]), Mm(y_pos), &font);
            y_pos -= line_height;
        }
    }

    document
        .save(&mut BufWriter::new(
            File::create(&output_path).map_err(|e| e.to_string())?,
        ))
        .map_err(|e| e.to_string())?;

    Ok(output_path.to_string_lossy().to_string())
}

// ─── Day Book PDF ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DayBookPdfEntry {
    pub voucher_date: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub party_name: String,
    pub account_name: String,
    pub narration: String,
    pub debit: f64,
    pub credit: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DayBookPdfData {
    pub company_name: String,
    pub period_from: String,
    pub period_to: String,
    pub detailed: bool,
    pub currency_symbol: Option<String>,
    pub total_debit: f64,
    pub total_credit: f64,
    pub entries: Vec<DayBookPdfEntry>,
}

#[tauri::command]
pub async fn generate_day_book_pdf(
    data: DayBookPdfData,
    file_path: String,
) -> Result<String, String> {
    let output_path = PathBuf::from(&file_path);

    let (document, page1, layer1) =
        PdfDocument::new("Day Book", Mm(210.0), Mm(297.0), "Layer 1");
    let font = document
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;
    let font_bold = document
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;

    let mut current_layer = document.get_page(page1).get_layer(layer1);

    let left_margin = 12.0_f32;
    let top_margin = 280.0_f32;
    let mut y_pos = top_margin;
    let line_height = 5.0_f32;
    let cell_padding = 0.8_f32;
    let currency_sym = data.currency_symbol.as_deref().unwrap_or("");

    // ── Header ──────────────────────────────────────────────────────────────
    current_layer.use_text(&data.company_name, 16.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 7.0;

    current_layer.use_text("DAY BOOK", 20.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    let period_info = format!("Period: {} to {}", data.period_from, data.period_to);
    current_layer.use_text(&period_info, 9.0, Mm(left_margin), Mm(y_pos), &font);
    y_pos -= 4.0;

    let mode_info = format!("Mode: {}", if data.detailed { "Detailed" } else { "Summary" });
    current_layer.use_text(&mode_info, 8.0, Mm(left_margin), Mm(y_pos), &font);
    y_pos -= 7.0;

    // ── Table columns: Date | Voucher | Type | Party | Account | Narration | Debit | Credit
    // Total printable width ≈ 186mm (210 - 2×12mm margins)
    let col_widths = [21.0_f32, 23.0, 16.0, 28.0, 30.0, 35.0, 18.0, 18.0];
    let mut col_x: Vec<f32> = vec![left_margin];
    for w in &col_widths[..col_widths.len() - 1] {
        col_x.push(col_x.last().unwrap() + w);
    }

    let headers = ["Date", "Voucher No", "Type", "Party", "Account", "Narration", "Debit", "Credit"];

    // Macro to draw column headers at a given y position
    macro_rules! draw_headers {
        ($layer:expr, $y:expr) => {
            for (i, h) in headers.iter().enumerate() {
                $layer.use_text(*h, 8.5, Mm(col_x[i] + cell_padding), Mm($y), &font_bold);
            }
        };
    }

    draw_headers!(current_layer, y_pos);
    y_pos -= line_height + 1.0;

    // ── Entry rows ───────────────────────────────────────────────────────────
    for entry in &data.entries {
        if y_pos < 30.0 {
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;
            draw_headers!(current_layer, y_pos);
            y_pos -= line_height + 1.0;
        }

        // Date
        current_layer.use_text(&entry.voucher_date, 7.5, Mm(col_x[0] + cell_padding), Mm(y_pos), &font);

        // Voucher No
        current_layer.use_text(&entry.voucher_no, 7.5, Mm(col_x[1] + cell_padding), Mm(y_pos), &font);

        // Type (formatted)
        let vtype = format_voucher_type(&entry.voucher_type);
        let vtype_trunc = if vtype.len() > 12 { format!("{}...", &vtype[..9]) } else { vtype };
        current_layer.use_text(&vtype_trunc, 7.5, Mm(col_x[2] + cell_padding), Mm(y_pos), &font);

        // Party (truncated)
        let party = if entry.party_name.len() > 16 {
            format!("{}...", &entry.party_name[..13])
        } else {
            entry.party_name.clone()
        };
        current_layer.use_text(&party, 7.5, Mm(col_x[3] + cell_padding), Mm(y_pos), &font);

        // Account (truncated)
        let account = if entry.account_name.len() > 18 {
            format!("{}...", &entry.account_name[..15])
        } else {
            entry.account_name.clone()
        };
        current_layer.use_text(&account, 7.5, Mm(col_x[4] + cell_padding), Mm(y_pos), &font);

        // Narration (truncated)
        let narration = if entry.narration.len() > 22 {
            format!("{}...", &entry.narration[..19])
        } else {
            entry.narration.clone()
        };
        current_layer.use_text(&narration, 7.5, Mm(col_x[5] + cell_padding), Mm(y_pos), &font);

        // Debit
        if entry.debit > 0.005 {
            let debit_str = format!("{}{:.2}", currency_sym, entry.debit);
            current_layer.use_text(&debit_str, 7.5, Mm(col_x[6] + cell_padding), Mm(y_pos), &font);
        }

        // Credit
        if entry.credit > 0.005 {
            let credit_str = format!("{}{:.2}", currency_sym, entry.credit);
            current_layer.use_text(&credit_str, 7.5, Mm(col_x[7] + cell_padding), Mm(y_pos), &font);
        }

        y_pos -= line_height;
    }

    // ── Totals row ───────────────────────────────────────────────────────────
    y_pos -= 2.0;
    if y_pos < 30.0 {
        let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
        current_layer = document.get_page(page).get_layer(layer);
        y_pos = top_margin - 15.0;
        draw_headers!(current_layer, y_pos);
        y_pos -= line_height + 1.0;
    }

    current_layer.use_text("TOTAL", 9.0, Mm(col_x[0] + cell_padding), Mm(y_pos), &font_bold);
    let total_debit_str = format!("{}{:.2}", currency_sym, data.total_debit);
    let total_credit_str = format!("{}{:.2}", currency_sym, data.total_credit);
    current_layer.use_text(&total_debit_str, 9.0, Mm(col_x[6] + cell_padding), Mm(y_pos), &font_bold);
    current_layer.use_text(&total_credit_str, 9.0, Mm(col_x[7] + cell_padding), Mm(y_pos), &font_bold);

    // ── Save ─────────────────────────────────────────────────────────────────
    document
        .save(&mut BufWriter::new(
            File::create(&output_path).map_err(|e| e.to_string())?,
        ))
        .map_err(|e| e.to_string())?;

    Ok(output_path.to_string_lossy().to_string())
}

// ─── Stock Report PDF ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StockReportPdfItem {
    pub product_code: String,
    pub product_name: String,
    pub group_name: String,
    pub unit_symbol: String,
    pub current_stock: f64,
    pub average_rate: f64,
    pub stock_value: f64,
    pub last_purchase_date: String,
    pub last_sale_date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StockReportPdfData {
    pub company_name: String,
    pub as_on_date: String,
    pub currency_symbol: Option<String>,
    pub total_products: usize,
    pub total_qty: f64,
    pub total_value: f64,
    pub items: Vec<StockReportPdfItem>,
}

#[tauri::command]
pub async fn generate_stock_report_pdf(
    data: StockReportPdfData,
    file_path: String,
) -> Result<String, String> {
    let output_path = PathBuf::from(&file_path);

    let (document, page1, layer1) =
        PdfDocument::new("Stock Report", Mm(210.0), Mm(297.0), "Layer 1");
    let font = document
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;
    let font_bold = document
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;

    let mut current_layer = document.get_page(page1).get_layer(layer1);

    let left_margin = 12.0_f32;
    let top_margin = 280.0_f32;
    let mut y_pos = top_margin;
    let line_height = 5.0_f32;
    let cell_padding = 0.8_f32;
    let currency_sym = data.currency_symbol.as_deref().unwrap_or("");

    // ── Header ───────────────────────────────────────────────────────────────
    current_layer.use_text(&data.company_name, 16.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 7.0;

    current_layer.use_text("STOCK REPORT", 20.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    let as_on = format!("As On: {}", data.as_on_date);
    current_layer.use_text(&as_on, 9.0, Mm(left_margin), Mm(y_pos), &font);
    y_pos -= 8.0;

    // ── Column layout
    // Columns: Code | Product Name | Group | Unit | Stock | Avg Rate | Value | Last Purch | Last Sale
    // Total printable ≈ 186mm
    let col_widths = [16.0_f32, 40.0, 22.0, 10.0, 18.0, 22.0, 22.0, 18.0, 18.0];
    let mut col_x: Vec<f32> = vec![left_margin];
    for w in &col_widths[..col_widths.len() - 1] {
        col_x.push(col_x.last().unwrap() + w);
    }

    let headers = ["Code", "Product Name", "Group", "Unit", "Stock", "Avg Rate", "Value", "Last Purch", "Last Sale"];

    macro_rules! draw_headers {
        ($layer:expr, $y:expr) => {
            for (i, h) in headers.iter().enumerate() {
                $layer.use_text(*h, 8.0, Mm(col_x[i] + cell_padding), Mm($y), &font_bold);
            }
        };
    }

    draw_headers!(current_layer, y_pos);
    y_pos -= line_height + 1.0;

    // ── Rows ─────────────────────────────────────────────────────────────────
    for item in &data.items {
        if y_pos < 30.0 {
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;
            draw_headers!(current_layer, y_pos);
            y_pos -= line_height + 1.0;
        }

        // Code
        current_layer.use_text(&item.product_code, 7.5, Mm(col_x[0] + cell_padding), Mm(y_pos), &font);

        // Product Name (truncate)
        let name = if item.product_name.len() > 24 {
            format!("{}...", &item.product_name[..21])
        } else {
            item.product_name.clone()
        };
        current_layer.use_text(&name, 7.5, Mm(col_x[1] + cell_padding), Mm(y_pos), &font);

        // Group (truncate)
        let group = if item.group_name.len() > 13 {
            format!("{}...", &item.group_name[..10])
        } else {
            item.group_name.clone()
        };
        current_layer.use_text(&group, 7.5, Mm(col_x[2] + cell_padding), Mm(y_pos), &font);

        // Unit
        current_layer.use_text(&item.unit_symbol, 7.5, Mm(col_x[3] + cell_padding), Mm(y_pos), &font);

        // Stock qty
        let stock_str = format!("{:.2}", item.current_stock);
        current_layer.use_text(&stock_str, 7.5, Mm(col_x[4] + cell_padding), Mm(y_pos), &font);

        // Avg Rate
        let rate_str = format!("{}{:.2}", currency_sym, item.average_rate);
        current_layer.use_text(&rate_str, 7.5, Mm(col_x[5] + cell_padding), Mm(y_pos), &font);

        // Stock Value
        let value_str = format!("{}{:.2}", currency_sym, item.stock_value);
        current_layer.use_text(&value_str, 7.5, Mm(col_x[6] + cell_padding), Mm(y_pos), &font);

        // Last Purchase Date (truncate to DD-MM-YY if long)
        let lp = if item.last_purchase_date.len() > 10 {
            item.last_purchase_date[..10].to_string()
        } else {
            item.last_purchase_date.clone()
        };
        current_layer.use_text(if lp.is_empty() { "-" } else { &lp }, 7.0, Mm(col_x[7] + cell_padding), Mm(y_pos), &font);

        // Last Sale Date
        let ls = if item.last_sale_date.len() > 10 {
            item.last_sale_date[..10].to_string()
        } else {
            item.last_sale_date.clone()
        };
        current_layer.use_text(if ls.is_empty() { "-" } else { &ls }, 7.0, Mm(col_x[8] + cell_padding), Mm(y_pos), &font);

        y_pos -= line_height;
    }

    // ── Totals row ───────────────────────────────────────────────────────────
    y_pos -= 2.0;
    if y_pos < 30.0 {
        let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
        current_layer = document.get_page(page).get_layer(layer);
        y_pos = top_margin - 15.0;
        draw_headers!(current_layer, y_pos);
        y_pos -= line_height + 1.0;
    }

    let total_label = format!("TOTAL ({} items)", data.total_products);
    current_layer.use_text(&total_label, 8.5, Mm(col_x[0] + cell_padding), Mm(y_pos), &font_bold);
    let total_qty_str = format!("{:.2}", data.total_qty);
    current_layer.use_text(&total_qty_str, 8.5, Mm(col_x[4] + cell_padding), Mm(y_pos), &font_bold);
    let total_val_str = format!("{}{:.2}", currency_sym, data.total_value);
    current_layer.use_text(&total_val_str, 8.5, Mm(col_x[6] + cell_padding), Mm(y_pos), &font_bold);

    // ── Save ─────────────────────────────────────────────────────────────────
    document
        .save(&mut BufWriter::new(
            File::create(&output_path).map_err(|e| e.to_string())?,
        ))
        .map_err(|e| e.to_string())?;

    Ok(output_path.to_string_lossy().to_string())
}

// ─── Party Outstanding PDF ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OutstandingPdfRow {
    pub party_name: String,
    pub total_invoices: i64,
    pub total_amount: f64,
    pub paid_amount: f64,
    pub outstanding_amount: f64,
    pub oldest_invoice_date: Option<String>,
    pub days_outstanding: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OutstandingPdfData {
    pub company_name: String,
    pub as_on_date: String,
    pub route_label: String,
    pub currency_symbol: Option<String>,
    pub customers: Vec<OutstandingPdfRow>,
    pub suppliers: Vec<OutstandingPdfRow>,
    pub total_receivables: f64,
    pub total_payables: f64,
}

#[tauri::command]
pub async fn generate_outstanding_pdf(
    data: OutstandingPdfData,
    file_path: String,
) -> Result<String, String> {
    let output_path = PathBuf::from(&file_path);

    let (document, page1, layer1) =
        PdfDocument::new("Party Outstanding Report", Mm(210.0), Mm(297.0), "Layer 1");
    let font = document
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;
    let font_bold = document
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;

    let mut current_layer = document.get_page(page1).get_layer(layer1);

    let left_margin = 12.0_f32;
    let top_margin = 280.0_f32;
    let line_height = 5.0_f32;
    let cell_pad = 0.8_f32;
    let currency_sym = data.currency_symbol.as_deref().unwrap_or("");

    // Column X positions
    let col_x: [f32; 7] = [
        left_margin,
        left_margin + 62.0,
        left_margin + 75.0,
        left_margin + 105.0,
        left_margin + 135.0,
        left_margin + 160.0,
        left_margin + 182.0,
    ];
    let headers = ["Party Name", "Inv", "Total", "Paid", "Outstanding", "Oldest", "Days"];

    let mut y_pos = top_margin;

    // ── Page header ─────────────────────────────────────────────────────────
    current_layer.use_text(&data.company_name, 14.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 7.0;
    current_layer.use_text("PARTY OUTSTANDING REPORT", 18.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 5.0;
    let route_info = if data.route_label.is_empty() || data.route_label == "All Routes" {
        format!("As on: {}   |   All Routes", data.as_on_date)
    } else {
        format!("As on: {}   |   Route: {}", data.as_on_date, data.route_label)
    };
    current_layer.use_text(&route_info, 9.0, Mm(left_margin), Mm(y_pos), &font);
    y_pos -= 10.0;

    // ── RECEIVABLES section ──────────────────────────────────────────────────
    current_layer.use_text("RECEIVABLES (CUSTOMERS)", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    for (i, h) in headers.iter().enumerate() {
        current_layer.use_text(*h, 8.5, Mm(col_x[i] + cell_pad), Mm(y_pos), &font_bold);
    }
    y_pos -= line_height + 0.5;

    if data.customers.is_empty() {
        current_layer.use_text("No receivables outstanding", 8.0, Mm(left_margin + cell_pad), Mm(y_pos), &font);
        y_pos -= line_height;
    } else {
        for row in &data.customers {
            if y_pos < 25.0 {
                let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
                current_layer = document.get_page(page).get_layer(layer);
                y_pos = top_margin;
                for (i, h) in headers.iter().enumerate() {
                    current_layer.use_text(*h, 8.5, Mm(col_x[i] + cell_pad), Mm(y_pos), &font_bold);
                }
                y_pos -= line_height + 0.5;
            }
            let name = if row.party_name.len() > 26 {
                format!("{}...", &row.party_name[..23])
            } else {
                row.party_name.clone()
            };
            current_layer.use_text(&name, 7.5, Mm(col_x[0] + cell_pad), Mm(y_pos), &font);
            current_layer.use_text(&row.total_invoices.to_string(), 7.5, Mm(col_x[1] + cell_pad), Mm(y_pos), &font);
            current_layer.use_text(&format!("{:.2}", row.total_amount), 7.5, Mm(col_x[2] + cell_pad), Mm(y_pos), &font);
            current_layer.use_text(&format!("{:.2}", row.paid_amount), 7.5, Mm(col_x[3] + cell_pad), Mm(y_pos), &font);
            current_layer.use_text(&format!("{:.2}", row.outstanding_amount.abs()), 7.5, Mm(col_x[4] + cell_pad), Mm(y_pos), &font_bold);
            let oldest = row.oldest_invoice_date.as_deref().unwrap_or("-");
            current_layer.use_text(oldest, 7.5, Mm(col_x[5] + cell_pad), Mm(y_pos), &font);
            let days = row.days_outstanding.map(|d| d.to_string()).unwrap_or_else(|| "-".to_string());
            current_layer.use_text(&days, 7.5, Mm(col_x[6] + cell_pad), Mm(y_pos), &font);
            y_pos -= line_height;
        }
    }
    y_pos -= 2.0;
    current_layer.use_text("TOTAL RECEIVABLES", 9.0, Mm(col_x[0] + cell_pad), Mm(y_pos), &font_bold);
    current_layer.use_text(
        &format!("{} {:.2}", currency_sym, data.total_receivables.abs()),
        9.0, Mm(col_x[4] + cell_pad), Mm(y_pos), &font_bold,
    );
    y_pos -= 12.0;

    // ── PAYABLES section (new page) ──────────────────────────────────────────
    let (page2, layer2) = document.add_page(Mm(210.0), Mm(297.0), "Page");
    current_layer = document.get_page(page2).get_layer(layer2);
    y_pos = top_margin;

    current_layer.use_text("PAYABLES (SUPPLIERS)", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    for (i, h) in headers.iter().enumerate() {
        current_layer.use_text(*h, 8.5, Mm(col_x[i] + cell_pad), Mm(y_pos), &font_bold);
    }
    y_pos -= line_height + 0.5;

    if data.suppliers.is_empty() {
        current_layer.use_text("No payables outstanding", 8.0, Mm(left_margin + cell_pad), Mm(y_pos), &font);
        y_pos -= line_height;
    } else {
        for row in &data.suppliers {
            if y_pos < 25.0 {
                let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
                current_layer = document.get_page(page).get_layer(layer);
                y_pos = top_margin;
                for (i, h) in headers.iter().enumerate() {
                    current_layer.use_text(*h, 8.5, Mm(col_x[i] + cell_pad), Mm(y_pos), &font_bold);
                }
                y_pos -= line_height + 0.5;
            }
            let name = if row.party_name.len() > 26 {
                format!("{}...", &row.party_name[..23])
            } else {
                row.party_name.clone()
            };
            current_layer.use_text(&name, 7.5, Mm(col_x[0] + cell_pad), Mm(y_pos), &font);
            current_layer.use_text(&row.total_invoices.to_string(), 7.5, Mm(col_x[1] + cell_pad), Mm(y_pos), &font);
            current_layer.use_text(&format!("{:.2}", row.total_amount), 7.5, Mm(col_x[2] + cell_pad), Mm(y_pos), &font);
            current_layer.use_text(&format!("{:.2}", row.paid_amount), 7.5, Mm(col_x[3] + cell_pad), Mm(y_pos), &font);
            current_layer.use_text(&format!("{:.2}", row.outstanding_amount.abs()), 7.5, Mm(col_x[4] + cell_pad), Mm(y_pos), &font_bold);
            let oldest = row.oldest_invoice_date.as_deref().unwrap_or("-");
            current_layer.use_text(oldest, 7.5, Mm(col_x[5] + cell_pad), Mm(y_pos), &font);
            let days = row.days_outstanding.map(|d| d.to_string()).unwrap_or_else(|| "-".to_string());
            current_layer.use_text(&days, 7.5, Mm(col_x[6] + cell_pad), Mm(y_pos), &font);
            y_pos -= line_height;
        }
    }
    y_pos -= 2.0;
    current_layer.use_text("TOTAL PAYABLES", 9.0, Mm(col_x[0] + cell_pad), Mm(y_pos), &font_bold);
    current_layer.use_text(
        &format!("{} {:.2}", currency_sym, data.total_payables.abs()),
        9.0, Mm(col_x[4] + cell_pad), Mm(y_pos), &font_bold,
    );
    y_pos -= 12.0;

    // ── Summary footer ───────────────────────────────────────────────────────
    if y_pos < 40.0 {
        let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
        current_layer = document.get_page(page).get_layer(layer);
        y_pos = top_margin;
    }
    current_layer.use_text("SUMMARY", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;
    current_layer.use_text("Total Receivables (From Customers):", 9.0, Mm(left_margin), Mm(y_pos), &font);
    current_layer.use_text(
        &format!("{} {:.2}", currency_sym, data.total_receivables.abs()),
        9.0, Mm(left_margin + 100.0), Mm(y_pos), &font_bold,
    );
    y_pos -= 5.5;
    current_layer.use_text("Total Payables (To Suppliers):", 9.0, Mm(left_margin), Mm(y_pos), &font);
    current_layer.use_text(
        &format!("{} {:.2}", currency_sym, data.total_payables.abs()),
        9.0, Mm(left_margin + 100.0), Mm(y_pos), &font_bold,
    );

    document
        .save(&mut BufWriter::new(
            File::create(&output_path).map_err(|e| e.to_string())?,
        ))
        .map_err(|e| e.to_string())?;

    Ok(output_path.to_string_lossy().to_string())
}

// ─── Expense Report PDF ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExpensePdfGroupRow {
    pub group_label: String,
    pub voucher_count: u32,
    pub total_amount: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExpensePdfDetailRow {
    pub voucher_no: String,
    pub voucher_date: String,
    pub account_name: String,
    pub product_name: Option<String>,
    pub amount: f64,
    pub narration: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExpensePdfData {
    pub company_name: String,
    pub period_from: String,
    pub period_to: String,
    pub group_by: String,
    pub currency_symbol: Option<String>,
    pub total_amount: f64,
    pub total_vouchers: u32,
    // Grouped summary rows (when not in product entry mode)
    pub rows: Vec<ExpensePdfGroupRow>,
    // Flat detail rows (when in product entry mode or if grouped rows with details)
    pub details: Vec<ExpensePdfDetailRow>,
    // Product entry mode
    pub is_product_mode: bool,
    pub product_label: Option<String>,
    pub show_product_column: bool,
}

#[tauri::command]
pub async fn generate_expense_pdf(
    data: ExpensePdfData,
    file_path: String,
) -> Result<String, String> {
    let output_path = std::path::PathBuf::from(&file_path);

    let (document, page1, layer1) =
        PdfDocument::new("Expense Report", Mm(210.0), Mm(297.0), "Layer 1");
    let font = document
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;
    let font_bold = document
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;

    let mut current_layer = document.get_page(page1).get_layer(layer1);

    let left_margin = 12.0_f32;
    let top_margin = 280.0_f32;
    let mut y_pos = top_margin;
    let line_height = 5.0_f32;
    let cell_padding = 0.8_f32;
    let currency_sym = data.currency_symbol.as_deref().unwrap_or("");

    // ── Header ──────────────────────────────────────────────────────────────
    current_layer.use_text(&data.company_name, 16.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 7.0;

    current_layer.use_text("EXPENSE REPORT", 20.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 6.0;

    if data.is_product_mode {
        if let Some(ref label) = data.product_label {
            let sub = format!("Product: {}", label);
            current_layer.use_text(&sub, 9.0, Mm(left_margin), Mm(y_pos), &font);
        }
    } else {
        let period_info = format!("Period: {} to {}", data.period_from, data.period_to);
        current_layer.use_text(&period_info, 9.0, Mm(left_margin), Mm(y_pos), &font);
    }
    y_pos -= 5.0;

    // Group-by label
    if !data.is_product_mode {
        let group_label = match data.group_by.as_str() {
            "day" => "Grouped by: Day",
            "account" => "Grouped by: Expense Account",
            "group" => "Grouped by: Account Group",
            "product" => "Grouped by: Product",
            _ => "Grouped by: Day",
        };
        current_layer.use_text(group_label, 8.0, Mm(left_margin), Mm(y_pos), &font);
        y_pos -= 8.0;
    } else {
        y_pos -= 4.0;
    }

    // Summary line
    let summary_str = format!(
        "Total Expenses: {} {:.2}   |   Total Payments: {}",
        currency_sym, data.total_amount, data.total_vouchers
    );
    current_layer.use_text(&summary_str, 9.0, Mm(left_margin), Mm(y_pos), &font_bold);
    y_pos -= 8.0;

    // ── Grouped Summary Table ────────────────────────────────────────────────
    if !data.is_product_mode && !data.rows.is_empty() {
        let col_widths_g = [90.0_f32, 30.0, 50.0];
        let col_x_g = [
            left_margin,
            left_margin + col_widths_g[0],
            left_margin + col_widths_g[0] + col_widths_g[1],
        ];

        let group_col_header = match data.group_by.as_str() {
            "day" => "Date",
            "account" => "Expense Account",
            "group" => "Account Group",
            "product" => "Product",
            _ => "Group",
        };

        // Table headers
        current_layer.use_text(group_col_header, 9.0, Mm(col_x_g[0] + cell_padding), Mm(y_pos), &font_bold);
        current_layer.use_text("Payments", 9.0, Mm(col_x_g[1] + cell_padding), Mm(y_pos), &font_bold);
        current_layer.use_text("Total Amount", 9.0, Mm(col_x_g[2] + cell_padding), Mm(y_pos), &font_bold);
        y_pos -= line_height;
        y_pos -= 1.0;

        for row in &data.rows {
            if y_pos < 25.0 {
                let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
                current_layer = document.get_page(page).get_layer(layer);
                y_pos = top_margin - 15.0;
                current_layer.use_text(group_col_header, 9.0, Mm(col_x_g[0] + cell_padding), Mm(y_pos), &font_bold);
                current_layer.use_text("Payments", 9.0, Mm(col_x_g[1] + cell_padding), Mm(y_pos), &font_bold);
                current_layer.use_text("Total Amount", 9.0, Mm(col_x_g[2] + cell_padding), Mm(y_pos), &font_bold);
                y_pos -= line_height;
                y_pos -= 1.0;
            }

            let label = if row.group_label.len() > 45 {
                format!("{}...", &row.group_label[..42])
            } else {
                row.group_label.clone()
            };
            current_layer.use_text(&label, 8.0, Mm(col_x_g[0] + cell_padding), Mm(y_pos), &font);
            current_layer.use_text(
                &row.voucher_count.to_string(),
                8.0,
                Mm(col_x_g[1] + cell_padding),
                Mm(y_pos),
                &font,
            );
            let amt_str = format!("{} {:.2}", currency_sym, row.total_amount);
            current_layer.use_text(&amt_str, 8.0, Mm(col_x_g[2] + cell_padding), Mm(y_pos), &font);
            y_pos -= line_height;
        }

        // Total row
        y_pos -= 2.0;
        if y_pos < 25.0 {
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;
        }
        current_layer.use_text("TOTAL", 9.0, Mm(col_x_g[0] + cell_padding), Mm(y_pos), &font_bold);
        current_layer.use_text(
            &data.total_vouchers.to_string(),
            9.0,
            Mm(col_x_g[1] + cell_padding),
            Mm(y_pos),
            &font_bold,
        );
        let total_str = format!("{} {:.2}", currency_sym, data.total_amount);
        current_layer.use_text(&total_str, 9.0, Mm(col_x_g[2] + cell_padding), Mm(y_pos), &font_bold);
    }

    // ── Flat Detail Table (product entry mode or detail-only mode) ───────────
    if !data.details.is_empty() {
        y_pos -= 10.0;
        if y_pos < 30.0 {
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;
        }

        if data.is_product_mode {
            current_layer.use_text("PAYMENT ENTRIES", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
        } else {
            current_layer.use_text("DETAILED ENTRIES", 11.0, Mm(left_margin), Mm(y_pos), &font_bold);
        }
        y_pos -= 7.0;

        // Column layout depends on whether product column is shown
        let (col_date, col_voucher, col_account, col_product, col_narration, col_amount) = if data.show_product_column {
            (left_margin, left_margin + 22.0, left_margin + 44.0, left_margin + 84.0, left_margin + 114.0, left_margin + 160.0)
        } else {
            (left_margin, left_margin + 22.0, left_margin + 48.0, -999.0, left_margin + 88.0, left_margin + 160.0)
        };

        // Headers
        current_layer.use_text("Date", 8.5, Mm(col_date + cell_padding), Mm(y_pos), &font_bold);
        current_layer.use_text("Voucher No", 8.5, Mm(col_voucher + cell_padding), Mm(y_pos), &font_bold);
        current_layer.use_text("Account", 8.5, Mm(col_account + cell_padding), Mm(y_pos), &font_bold);
        if data.show_product_column {
            current_layer.use_text("Product", 8.5, Mm(col_product + cell_padding), Mm(y_pos), &font_bold);
        }
        current_layer.use_text("Narration", 8.5, Mm(col_narration + cell_padding), Mm(y_pos), &font_bold);
        current_layer.use_text("Amount", 8.5, Mm(col_amount + cell_padding), Mm(y_pos), &font_bold);
        y_pos -= line_height;
        y_pos -= 1.0;

        let mut detail_total = 0.0_f64;
        for d in &data.details {
            if y_pos < 25.0 {
                let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
                current_layer = document.get_page(page).get_layer(layer);
                y_pos = top_margin - 15.0;
                current_layer.use_text("Date", 8.5, Mm(col_date + cell_padding), Mm(y_pos), &font_bold);
                current_layer.use_text("Voucher No", 8.5, Mm(col_voucher + cell_padding), Mm(y_pos), &font_bold);
                current_layer.use_text("Account", 8.5, Mm(col_account + cell_padding), Mm(y_pos), &font_bold);
                if data.show_product_column {
                    current_layer.use_text("Product", 8.5, Mm(col_product + cell_padding), Mm(y_pos), &font_bold);
                }
                current_layer.use_text("Narration", 8.5, Mm(col_narration + cell_padding), Mm(y_pos), &font_bold);
                current_layer.use_text("Amount", 8.5, Mm(col_amount + cell_padding), Mm(y_pos), &font_bold);
                y_pos -= line_height;
                y_pos -= 1.0;
            }

            current_layer.use_text(&d.voucher_date, 7.5, Mm(col_date + cell_padding), Mm(y_pos), &font);

            let vno = if d.voucher_no.len() > 12 {
                format!("{}...", &d.voucher_no[..9])
            } else {
                d.voucher_no.clone()
            };
            current_layer.use_text(&vno, 7.5, Mm(col_voucher + cell_padding), Mm(y_pos), &font);

            let acc = if d.account_name.len() > 20 {
                format!("{}...", &d.account_name[..17])
            } else {
                d.account_name.clone()
            };
            current_layer.use_text(&acc, 7.5, Mm(col_account + cell_padding), Mm(y_pos), &font);

            if data.show_product_column {
                let prod = d.product_name.as_deref().unwrap_or("—");
                let prod_str = if prod.len() > 18 {
                    format!("{}...", &prod[..15])
                } else {
                    prod.to_string()
                };
                current_layer.use_text(&prod_str, 7.5, Mm(col_product + cell_padding), Mm(y_pos), &font);
            }

            let narr = d.narration.as_deref().unwrap_or("—");
            let narr_str = if narr.len() > 22 {
                format!("{}...", &narr[..19])
            } else {
                narr.to_string()
            };
            current_layer.use_text(&narr_str, 7.5, Mm(col_narration + cell_padding), Mm(y_pos), &font);

            let amt_str = format!("{} {:.2}", currency_sym, d.amount);
            current_layer.use_text(&amt_str, 7.5, Mm(col_amount + cell_padding), Mm(y_pos), &font);

            detail_total += d.amount;
            y_pos -= line_height;
        }

        // Total row
        y_pos -= 2.0;
        if y_pos < 25.0 {
            let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
            current_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;
        }
        current_layer.use_text("TOTAL", 9.0, Mm(col_date + cell_padding), Mm(y_pos), &font_bold);
        let total_str = format!("{} {:.2}", currency_sym, detail_total);
        current_layer.use_text(&total_str, 9.0, Mm(col_amount + cell_padding), Mm(y_pos), &font_bold);
    }

    document
        .save(&mut BufWriter::new(
            File::create(&output_path).map_err(|e| e.to_string())?,
        ))
        .map_err(|e| e.to_string())?;

    Ok(output_path.to_string_lossy().to_string())
}

