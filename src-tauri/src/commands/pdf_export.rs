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
