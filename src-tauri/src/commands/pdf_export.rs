use printpdf::*;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use dirs::download_dir;

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
    pub entries: Vec<LedgerPdfEntry>,
}

#[tauri::command]
pub fn get_downloads_path() -> Result<String, String> {
    download_dir()
        .ok_or_else(|| "Could not find downloads directory".to_string())
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn generate_ledger_pdf(
    data: LedgerPdfData,
    file_path: String,
) -> Result<String, String> {
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

    let current_layer = document.get_page(page1).get_layer(layer1);

    // Margins
    let left_margin = 12.0;
    let top_margin = 280.0;
    let mut y_pos = top_margin;

    // Title
    current_layer.use_text("LEDGER REPORT", 24.0, Mm(left_margin), Mm(y_pos), &font_bold);
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

    let headers = vec!["Date", "Voucher No", "Type", "Narration", "Debit", "Credit", "Balance"];
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

        let balance_str = format!(
            "₹ {:.2}",
            data.opening_balance.abs()
        );
        let dr_cr = if data.opening_balance >= 0.0 { "Dr" } else { "Cr" };
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
            let new_layer = document.get_page(page).get_layer(layer);
            y_pos = top_margin - 15.0;

            // Repeat headers on new page
            for (i, header) in headers.iter().enumerate() {
                new_layer.use_text(
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
        current_layer.use_text(
            &entry.voucher_type,
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

        // Balance (right-aligned)
        let balance_str = format!(
            "₹ {:>10.2} {}",
            entry.balance.abs(),
            if entry.balance >= 0.0 { "Dr" } else { "Cr" }
        );
        current_layer.use_text(
            &balance_str,
            7.5,
            Mm(col_x[6] - 8.0),
            Mm(y_pos),
            &font,
        );

        y_pos -= line_height;
    }

    // Closing Balance Row
    y_pos -= 2.0;
    y_pos -= 2.0;

    current_layer.use_text(
        "Closing Balance",
        9.0,
        Mm(col_x[0] + cell_padding),
        Mm(y_pos),
        &font_bold,
    );

    let closing_str = format!(
        "₹ {:.2}",
        data.closing_balance.abs()
    );
    let dr_cr = if data.closing_balance >= 0.0 { "Dr" } else { "Cr" };
    current_layer.use_text(
        &format!("{} {}", closing_str, dr_cr),
        9.0,
        Mm(col_x[6] - 8.0),
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
