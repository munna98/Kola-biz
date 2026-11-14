pub fn number_to_words_indian(num: f64) -> String {
    let num_int = num.floor() as u64;
    let paise = ((num - num.floor()) * 100.0).round() as u64;

    let mut words = convert_to_words(num_int);

    if num_int == 0 {
        words = "Zero".to_string();
    }

    words.push_str(" Rupees");

    if paise > 0 {
        words.push_str(" and ");
        words.push_str(&convert_to_words(paise));
        words.push_str(" Paise");
    }

    words.push_str(" Only");
    words
}

pub fn number_to_words_currency(num: f64, currency_code: &str, currency_name: Option<&str>) -> String {
    let code_upper = currency_code.to_uppercase();
    if code_upper == "INR" || code_upper.is_empty() {
        return number_to_words_indian(num);
    }

    let num_int = num.floor() as u64;
    let fraction = ((num - num.floor()) * 100.0).round() as u64;

    let mut words = convert_to_words_international(num_int);
    if num_int == 0 {
        words = "Zero".to_string();
    }

    let (unit_name, subunit_name) = match code_upper.as_str() {
        "USD" => ("US Dollars", "Cents"),
        "EUR" => ("Euros", "Cents"),
        "GBP" => ("Pounds", "Pence"),
        "AED" => ("UAE Dirhams", "Fils"),
        "SAR" => ("Saudi Riyals", "Halalas"),
        "QAR" => ("Qatari Riyals", "Dirhams"),
        "OMR" => ("Omani Rials", "Baisa"),
        "KWD" => ("Kuwaiti Dinars", "Fils"),
        "BHD" => ("Bahraini Dinars", "Fils"),
        "CAD" => ("Canadian Dollars", "Cents"),
        "AUD" => ("Australian Dollars", "Cents"),
        "SGD" => ("Singapore Dollars", "Cents"),
        _ => (currency_name.unwrap_or(currency_code), "Cents"),
    };

    words.push(' ');
    words.push_str(unit_name);

    if fraction > 0 {
        words.push_str(" and ");
        words.push_str(&convert_to_words_international(fraction));
        words.push(' ');
        words.push_str(subunit_name);
    }

    words.push_str(" Only");
    words
}

pub fn convert_to_words_international(num: u64) -> String {
    if num == 0 {
        return "".to_string();
    }

    let units = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
    ];
    let tens = [
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
    ];

    if num < 20 {
        return units[num as usize].to_string();
    }

    if num < 100 {
        return format!(
            "{} {}",
            tens[(num / 10) as usize],
            units[(num % 10) as usize]
        )
        .trim()
        .to_string();
    }

    if num < 1000 {
        return format!(
            "{} Hundred {}",
            units[(num / 100) as usize],
            convert_to_words_international(num % 100)
        )
        .trim()
        .to_string();
    }

    if num < 1_000_000 {
        return format!(
            "{} Thousand {}",
            convert_to_words_international(num / 1000),
            convert_to_words_international(num % 1000)
        )
        .trim()
        .to_string();
    }

    if num < 1_000_000_000 {
        return format!(
            "{} Million {}",
            convert_to_words_international(num / 1_000_000),
            convert_to_words_international(num % 1_000_000)
        )
        .trim()
        .to_string();
    }

    format!(
        "{} Billion {}",
        convert_to_words_international(num / 1_000_000_000),
        convert_to_words_international(num % 1_000_000_000)
    )
    .trim()
    .to_string()
}

fn convert_to_words(num: u64) -> String {
    if num == 0 {
        return "".to_string();
    }

    let units = [
        "",
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "Nine",
        "Ten",
        "Eleven",
        "Twelve",
        "Thirteen",
        "Fourteen",
        "Fifteen",
        "Sixteen",
        "Seventeen",
        "Eighteen",
        "Nineteen",
    ];
    let tens = [
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
    ];

    if num < 20 {
        return units[num as usize].to_string();
    }

    if num < 100 {
        return format!(
            "{} {}",
            tens[(num / 10) as usize],
            units[(num % 10) as usize]
        )
        .trim()
        .to_string();
    }

    if num < 1000 {
        return format!(
            "{} Hundred {}",
            units[(num / 100) as usize],
            convert_to_words(num % 100)
        )
        .trim()
        .to_string();
    }

    if num < 100000 {
        return format!(
            "{} Thousand {}",
            convert_to_words(num / 1000),
            convert_to_words(num % 1000)
        )
        .trim()
        .to_string();
    }

    if num < 10000000 {
        return format!(
            "{} Lakh {}",
            convert_to_words(num / 100000),
            convert_to_words(num % 100000)
        )
        .trim()
        .to_string();
    }

    return format!(
        "{} Crore {}",
        convert_to_words(num / 10000000),
        convert_to_words(num % 10000000)
    )
    .trim()
    .to_string();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inr_words() {
        assert_eq!(number_to_words_indian(9600.0), "Nine Thousand Six Hundred Rupees Only");
        assert_eq!(number_to_words_currency(9600.0, "INR", None), "Nine Thousand Six Hundred Rupees Only");
    }

    #[test]
    fn test_usd_words() {
        assert_eq!(number_to_words_currency(100.0, "USD", Some("US Dollar")), "One Hundred US Dollars Only");
        assert_eq!(number_to_words_currency(100.50, "USD", Some("US Dollar")), "One Hundred US Dollars and Fifty Cents Only");
        assert_eq!(number_to_words_currency(1234567.89, "USD", Some("US Dollar")), "One Million Two Hundred Thirty Four Thousand Five Hundred Sixty Seven US Dollars and Eighty Nine Cents Only");
    }
}
