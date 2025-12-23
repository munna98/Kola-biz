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
