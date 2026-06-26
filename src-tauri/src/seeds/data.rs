use bcrypt;
use sqlx::SqlitePool;
use uuid::Uuid;

pub async fn seed_initial_data(pool: &SqlitePool) -> Result<(), Box<dyn std::error::Error>> {
    // Insert default account groups
    let groups = [
        ("Current Assets", "Asset"),
        ("Bank Account", "Asset"),
        ("Cash", "Asset"),
        ("Non-Current Assets", "Asset"),
        ("Accounts Receivable", "Asset"),
        ("Inventory", "Asset"),
        ("Tax Receivable", "Asset"),
        ("Current Liabilities", "Liability"),
        ("Non-Current Liabilities", "Liability"),
        ("Accounts Payable", "Liability"),
        ("Tax Payable", "Liability"),
        ("Duties & Taxes", "Liability"),
        ("Equity", "Equity"),
        ("Revenue", "Income"),
        ("Other Income", "Income"),
        ("Cost of Sales", "Expense"),
        ("Operating Expenses", "Expense"),
        ("Financial Expenses", "Expense"),
        ("Discounts", "Expense"),
    ];

    for (name, acc_type) in groups {
        sqlx::query(
            "INSERT OR IGNORE INTO account_groups (id, name, account_type) VALUES (?, ?, ?)",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(name)
        .bind(acc_type)
        .execute(pool)
        .await?;
    }

    // Insert default chart of accounts
    let coas = [
        ("1001", "Cash", "Asset", "Cash", "Cash and cash equivalents"),
        (
            "1002",
            "Bank Account",
            "Asset",
            "Bank Account",
            "Bank deposits and accounts",
        ),
        (
            "1004",
            "Inventory",
            "Asset",
            "Inventory",
            "Stock of goods for sale",
        ),
        (
            "1005",
            "GST Input / Tax Receivable",
            "Asset",
            "Tax Receivable",
            "Tax paid on purchases",
        ),
        (
            "1006",
            "Prepaid Expenses",
            "Asset",
            "Current Assets",
            "Expenses paid in advance",
        ),
        (
            "1007",
            "Undeposited Funds",
            "Asset",
            "Current Assets",
            "Cash receipts not yet deposited",
        ),
        (
            "2002",
            "GST Output / Tax Payable",
            "Liability",
            "Tax Payable",
            "Tax collected on sales",
        ),
        (
            "2003",
            "Accrued Expenses",
            "Liability",
            "Current Liabilities",
            "Expenses incurred but not paid",
        ),
        ("3001", "Capital", "Equity", "Equity", "Owner capital"),
        (
            "3002",
            "Retained Earnings",
            "Equity",
            "Equity",
            "Accumulated profits",
        ),
        ("3003", "Drawings", "Equity", "Equity", "Owner withdrawals"),
        (
            "3004",
            "Opening Balance Adjustment",
            "Equity",
            "Equity",
            "System account for opening balance auto-balancing",
        ),
        (
            "4001",
            "Sales",
            "Income",
            "Revenue",
            "Product sales revenue",
        ),
        ("4002", "Services", "Income", "Revenue", "Service revenue"),
        (
            "4003",
            "Sales Returns",
            "Income",
            "Revenue",
            "Contra revenue - goods returned by customers",
        ),
        (
            "4004",
            "Discount Received",
            "Income",
            "Other Income",
            "Discounts received from suppliers",
        ),
        (
            "5001",
            "Purchases",
            "Expense",
            "Cost of Sales",
            "Raw purchases of goods",
        ),
        (
            "5002",
            "Cost of Goods Sold",
            "Expense",
            "Cost of Sales",
            "Cost of products sold",
        ),
        (
            "5003",
            "Purchase Returns",
            "Expense",
            "Cost of Sales",
            "Contra expense - goods returned to supplier",
        ),
        (
            "5004",
            "Operating Expenses",
            "Expense",
            "Operating Expenses",
            "General operating expenses",
        ),
        (
            "5005",
            "Salary Expenses",
            "Expense",
            "Operating Expenses",
            "Employee salaries",
        ),
        (
            "5006",
            "Bank Charges",
            "Expense",
            "Financial Expenses",
            "Bank fees and charges",
        ),
        (
            "5007",
            "Discount Allowed",
            "Expense",
            "Discounts",
            "Discounts given to customers",
        ),
        (
            "5008",
            "Delivery Expenses",
            "Expense",
            "Operating Expenses",
            "Shipping and delivery costs",
        ),
        (
            "5009",
            "Rent Expense",
            "Expense",
            "Operating Expenses",
            "Office or shop rent",
        ),
        (
            "5010",
            "Utilities Expense",
            "Expense",
            "Operating Expenses",
            "Electricity, water, internet",
        ),
        (
            "5011",
            "Service Expenses",
            "Expense",
            "Operating Expenses",
            "Cost of services purchased from vendors",
        ),
    ];

    for (code, name, acc_type, group, desc) in coas {
        sqlx::query(
            "INSERT OR IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)"
        )
        .bind(Uuid::now_v7().to_string())
        .bind(code)
        .bind(name)
        .bind(acc_type)
        .bind(group)
        .bind(desc)
        .execute(pool)
        .await?;
    }

    // ==================== GST Accounts ====================
    // Output Tax accounts (sales — Liability)
    // Input Credit accounts (purchases — Asset)
    let gst_coas: &[(&str, &str, &str, &str, &str)] = &[
        // Output (Payable) — intra-state
        ("GST-C25P",  "CGST 2.5% Payable",        "Liability", "Duties & Taxes", "CGST collected on sales at 5% slab"),
        ("GST-S25P",  "SGST 2.5% Payable",        "Liability", "Duties & Taxes", "SGST collected on sales at 5% slab"),
        ("GST-C6P",   "CGST 6% Payable",          "Liability", "Duties & Taxes", "CGST collected on sales at 12% slab"),
        ("GST-S6P",   "SGST 6% Payable",          "Liability", "Duties & Taxes", "SGST collected on sales at 12% slab"),
        ("GST-C9P",   "CGST 9% Payable",          "Liability", "Duties & Taxes", "CGST collected on sales at 18% slab"),
        ("GST-S9P",   "SGST 9% Payable",          "Liability", "Duties & Taxes", "SGST collected on sales at 18% slab"),
        ("GST-C14P",  "CGST 14% Payable",         "Liability", "Duties & Taxes", "CGST collected on sales at 28% slab"),
        ("GST-S14P",  "SGST 14% Payable",         "Liability", "Duties & Taxes", "SGST collected on sales at 28% slab"),
        // Output (Payable) — inter-state
        ("GST-I5P",   "IGST 5% Payable",          "Liability", "Duties & Taxes", "IGST collected on inter-state sales at 5%"),
        ("GST-I12P",  "IGST 12% Payable",         "Liability", "Duties & Taxes", "IGST collected on inter-state sales at 12%"),
        ("GST-I18P",  "IGST 18% Payable",         "Liability", "Duties & Taxes", "IGST collected on inter-state sales at 18%"),
        ("GST-I28P",  "IGST 28% Payable",         "Liability", "Duties & Taxes", "IGST collected on inter-state sales at 28%"),
        // Input Credits (purchases — Asset)
        ("GST-C25I",  "CGST 2.5% Input Credit",   "Asset",     "Tax Receivable",  "CGST paid on purchases at 5% slab"),
        ("GST-S25I",  "SGST 2.5% Input Credit",   "Asset",     "Tax Receivable",  "SGST paid on purchases at 5% slab"),
        ("GST-C6I",   "CGST 6% Input Credit",     "Asset",     "Tax Receivable",  "CGST paid on purchases at 12% slab"),
        ("GST-S6I",   "SGST 6% Input Credit",     "Asset",     "Tax Receivable",  "SGST paid on purchases at 12% slab"),
        ("GST-C9I",   "CGST 9% Input Credit",     "Asset",     "Tax Receivable",  "CGST paid on purchases at 18% slab"),
        ("GST-S9I",   "SGST 9% Input Credit",     "Asset",     "Tax Receivable",  "SGST paid on purchases at 18% slab"),
        ("GST-C14I",  "CGST 14% Input Credit",    "Asset",     "Tax Receivable",  "CGST paid on purchases at 28% slab"),
        ("GST-S14I",  "SGST 14% Input Credit",    "Asset",     "Tax Receivable",  "SGST paid on purchases at 28% slab"),
        // Input Credits — inter-state
        ("GST-I5I",   "IGST 5% Input Credit",     "Asset",     "Tax Receivable",  "IGST paid on inter-state purchases at 5%"),
        ("GST-I12I",  "IGST 12% Input Credit",    "Asset",     "Tax Receivable",  "IGST paid on inter-state purchases at 12%"),
        ("GST-I18I",  "IGST 18% Input Credit",    "Asset",     "Tax Receivable",  "IGST paid on inter-state purchases at 18%"),
        ("GST-I28I",  "IGST 28% Input Credit",    "Asset",     "Tax Receivable",  "IGST paid on inter-state purchases at 28%"),
    ];

    for (code, name, acc_type, group, desc) in gst_coas {
        sqlx::query(
            "INSERT OR IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)"
        )
        .bind(Uuid::now_v7().to_string())
        .bind(code)
        .bind(name)
        .bind(acc_type)
        .bind(group)
        .bind(desc)
        .execute(pool)
        .await?;
    }

    // Insert default units
    let units = [("Piece", "Pcs", 1), ("Kilogram", "Kg", 0), ("Liter", "L", 0)];

    for (name, symbol, is_default) in units {
        sqlx::query("INSERT OR IGNORE INTO units (id, name, symbol, is_default) VALUES (?, ?, ?, ?)")
            .bind(Uuid::now_v7().to_string())
            .bind(name)
            .bind(symbol)
            .bind(is_default)
            .execute(pool)
            .await?;
    }
    // Insert currencies
    let currencies = [
        ("AED", "United Arab Emirates", "UAE Dirham", "د.إ"),
        ("AFN", "Afghanistan", "Afghan Afghani", "؋"),
        ("ALL", "Albania", "Albanian Lek", "L"),
        ("AMD", "Armenia", "Armenian Dram", "֏"),
        ("AOA", "Angola", "Angolan Kwanza", "Kz"),
        ("ARS", "Argentina", "Argentine Peso", "$"),
        ("AUD", "Australia", "Australian Dollar", "$"),
        ("AZN", "Azerbaijan", "Azerbaijani Manat", "₼"),
        ("BAM", "Bosnia and Herzegovina", "Convertible Mark", "KM"),
        ("BBD", "Barbados", "Barbadian Dollar", "$"),
        ("BDT", "Bangladesh", "Bangladeshi Taka", "৳"),
        ("BGN", "Bulgaria", "Bulgarian Lev", "лв."),
        ("BHD", "Bahrain", "Bahraini Dinar", ".د.ب"),
        ("BIF", "Burundi", "Burundian Franc", "Fr"),
        ("BND", "Brunei", "Brunei Dollar", "$"),
        ("BOB", "Bolivia", "Bolivian Boliviano", "Bs."),
        ("BRL", "Brazil", "Brazilian Real", "R$"),
        ("BSD", "Bahamas", "Bahamian Dollar", "$"),
        ("BTN", "Bhutan", "Bhutanese Ngultrum", "Nu."),
        ("BWP", "Botswana", "Botswana Pula", "P"),
        ("BYN", "Belarus", "Belarusian Ruble", "Br"),
        ("BZD", "Belize", "Belize Dollar", "$"),
        ("CAD", "Canada", "Canadian Dollar", "$"),
        ("CDF", "Congo (Democratic Republic)", "Congolese Franc", "Fr"),
        ("CHF", "Switzerland", "Swiss Franc", "CHF"),
        ("CLP", "Chile", "Chilean Peso", "$"),
        ("CNY", "China", "Chinese Yuan", "¥"),
        ("COP", "Colombia", "Colombian Peso", "$"),
        ("CRC", "Costa Rica", "Costa Rican Colón", "₡"),
        ("CUP", "Cuba", "Cuban Peso", "$"),
        ("CVE", "Cabo Verde", "Cape Verdean Escudo", "Esc"),
        ("CZK", "Czech Republic", "Czech Koruna", "Kč"),
        ("DJF", "Djibouti", "Djiboutian Franc", "Fr"),
        ("DKK", "Denmark", "Danish Krone", "kr."),
        ("DOP", "Dominican Republic", "Dominican Peso", "$"),
        ("DZD", "Algeria", "Algerian Dinar", "د.ج"),
        ("EGP", "Egypt", "Egyptian Pound", "£"),
        ("ERN", "Eritrea", "Eritrean Nakfa", "Nfk"),
        ("ETB", "Ethiopia", "Ethiopian Birr", "Br"),
        ("EUR", "Eurozone", "Euro", "€"),
        ("FJD", "Fiji", "Fijian Dollar", "$"),
        ("GBP", "United Kingdom", "British Pound", "£"),
        ("GEL", "Georgia", "Georgian Lari", "₾"),
        ("GHS", "Ghana", "Ghanaian Cedi", "₵"),
        ("GMD", "Gambia", "Gambian Dalasi", "D"),
        ("GNF", "Guinea", "Guinean Franc", "Fr"),
        ("GTQ", "Guatemala", "Guatemalan Quetzal", "Q"),
        ("GYD", "Guyana", "Guyanese Dollar", "$"),
        ("HNL", "Honduras", "Honduran Lempira", "L"),
        ("HTG", "Haiti", "Haitian Gourde", "G"),
        ("HUF", "Hungary", "Hungarian Forint", "Ft"),
        ("IDR", "Indonesia", "Indonesian Rupiah", "Rp"),
        ("ILS", "Israel", "Israeli New Shekel", "₪"),
        ("INR", "India", "Indian Rupee", "₹"),
        ("IQD", "Iraq", "Iraqi Dinar", "ع.د"),
        ("IRR", "Iran", "Iranian Rial", "﷼"),
        ("ISK", "Iceland", "Icelandic Króna", "kr"),
        ("JMD", "Jamaica", "Jamaican Dollar", "$"),
        ("JOD", "Jordan", "Jordanian Dinar", "د.ا"),
        ("JPY", "Japan", "Japanese Yen", "¥"),
        ("KES", "Kenya", "Kenyan Shilling", "Sh"),
        ("KGS", "Kyrgyzstan", "Kyrgyzstani Som", "с"),
        ("KHR", "Cambodia", "Cambodian Riel", "៛"),
        ("KMF", "Comoros", "Comorian Franc", "Fr"),
        ("KPW", "North Korea", "North Korean Won", "₩"),
        ("KRW", "South Korea", "South Korean Won", "₩"),
        ("KWD", "Kuwait", "Kuwaiti Dinar", "د.ك"),
        ("KZT", "Kazakhstan", "Kazakhstani Tenge", "₸"),
        ("LAK", "Laos", "Lao Kip", "₭"),
        ("LBP", "Lebanon", "Lebanese Pound", "ل.ل"),
        ("LKR", "Sri Lanka", "Sri Lankan Rupee", "Rs"),
        ("LRD", "Liberia", "Liberian Dollar", "$"),
        ("LSL", "Lesotho", "Lesotho Loti", "L"),
        ("LYD", "Libya", "Libyan Dinar", "د.ل"),
        ("MAD", "Morocco", "Moroccan Dirham", "د.م."),
        ("MDL", "Moldova", "Moldovan Leu", "L"),
        ("MGA", "Madagascar", "Malagasy Ariary", "Ar"),
        ("MKD", "North Macedonia", "Macedonian Denar", "ден"),
        ("MMK", "Myanmar", "Myanmar Kyat", "K"),
        ("MNT", "Mongolia", "Mongolian Tögrög", "₮"),
        ("MRU", "Mauritania", "Mauritanian Ouguiya", "UM"),
        ("MUR", "Mauritius", "Mauritian Rupee", "₨"),
        ("MVR", "Maldives", "Maldivian Rufiyaa", "Rf"),
        ("MWK", "Malawi", "Malawian Kwacha", "MK"),
        ("MXN", "Mexico", "Mexican Peso", "$"),
        ("MYR", "Malaysia", "Malaysian Ringgit", "RM"),
        ("MZN", "Mozambique", "Mozambican Metical", "MT"),
        ("NAD", "Namibia", "Namibian Dollar", "$"),
        ("NGN", "Nigeria", "Nigerian Naira", "₦"),
        ("NIO", "Nicaragua", "Nicaraguan Córdoba", "C$"),
        ("NOK", "Norway", "Norwegian Krone", "kr"),
        ("NPR", "Nepal", "Nepalese Rupee", "₨"),
        ("NZD", "New Zealand", "New Zealand Dollar", "$"),
        ("OMR", "Oman", "Omani Rial", "ر.ع."),
        ("PAB", "Panama", "Panamanian Balboa", "B/."),
        ("PEN", "Peru", "Peruvian Sol", "S/."),
        ("PGK", "Papua New Guinea", "Papua New Guinean Kina", "K"),
        ("PHP", "Philippines", "Philippine Peso", "₱"),
        ("PKR", "Pakistan", "Pakistani Rupee", "₨"),
        ("PLN", "Poland", "Polish Złoty", "zł"),
        ("PYG", "Paraguay", "Paraguayan Guaraní", "₲"),
        ("QAR", "Qatar", "Qatari Riyal", "ر.ق"),
        ("RON", "Romania", "Romanian Leu", "lei"),
        ("RSD", "Serbia", "Serbian Dinar", "дин."),
        ("RUB", "Russia", "Russian Ruble", "₽"),
        ("RWF", "Rwanda", "Rwandan Franc", "Fr"),
        ("SAR", "Saudi Arabia", "Saudi Riyal", "ر.🇸"),
        ("SBD", "Solomon Islands", "Solomon Islands Dollar", "$"),
        ("SCR", "Seychelles", "Seychellois Rupee", "₨"),
        ("SDG", "Sudan", "Sudanese Pound", "ج.س."),
        ("SEK", "Sweden", "Swedish Krona", "kr"),
        ("SGD", "Singapore", "Singapore Dollar", "$"),
        ("SLE", "Sierra Leone", "Sierra Leonean Leone", "Le"),
        ("SOS", "Somalia", "Somali Shilling", "Sh"),
        ("SRD", "Suriname", "Surinamese Dollar", "$"),
        ("SSP", "South Sudan", "South Sudanese Pound", "£"),
        ("STN", "Sao Tome and Principe", "São Tomé and Príncipe Dobra", "Db"),
        ("SYP", "Syria", "Syrian Pound", "£"),
        ("SZL", "Eswatini", "Swazi Lilangeni", "L"),
        ("THB", "Thailand", "Thai Baht", "฿"),
        ("TJS", "Tajikistan", "Tajikistani Somoni", "ЅМ"),
        ("TMT", "Turkmenistan", "Turkmenistan Manat", "m"),
        ("TND", "Tunisia", "Tunisian Dinar", "د.ت"),
        ("TOP", "Tonga", "Tongan Paʻanga", "T$"),
        ("TRY", "Turkey", "Turkish Lira", "₺"),
        ("TTD", "Trinidad and Tobago", "Trinidad and Tobago Dollar", "$"),
        ("TWD", "Taiwan", "New Taiwan Dollar", "NT$"),
        ("TZS", "Tanzania", "Tanzanian Shilling", "Sh"),
        ("UAH", "Ukraine", "Ukrainian Hryvnia", "₴"),
        ("UGX", "Uganda", "Ugandan Shilling", "Sh"),
        ("USD", "United States", "US Dollar", "$"),
        ("UYU", "Uruguay", "Uruguayan Peso", "$U"),
        ("UZS", "Uzbekistan", "Uzbekistani Som", "soʻm"),
        ("VES", "Venezuela", "Venezuelan Bolívar Soberano", "Bs.S"),
        ("VND", "Vietnam", "Vietnamese Đồng", "₫"),
        ("VUV", "Vanuatu", "Vanuatu Vatu", "Vt"),
        ("WST", "Samoa", "Samoan Tālā", "T"),
        ("XAF", "Central African CFA States", "Central African CFA Franc", "Fr"),
        ("XCD", "East Caribbean States", "East Caribbean Dollar", "$"),
        ("XOF", "West African CFA States", "West African CFA Franc", "Fr"),
        ("YER", "Yemen", "Yemeni Rial", "﷼"),
        ("ZAR", "South Africa", "South African Rand", "R"),
        ("ZMW", "Zambia", "Zambian Kwacha", "ZK"),
        ("ZWG", "Zimbabwe", "Zimbabwe Gold", "ZiG"),
    ];

    for (code, country, currency_name, symbol) in currencies {
        sqlx::query("INSERT OR IGNORE INTO currencies (id, code, name, symbol, country) VALUES (?, ?, ?, ?, ?)")
            .bind(Uuid::now_v7().to_string())
            .bind(code)
            .bind(currency_name)
            .bind(symbol)
            .bind(country)
            .execute(pool)
            .await?;
    }

    // Insert countries
    let countries = [
        ("Afghanistan", "AF"), 
        ("Åland Islands", "AX"), 
        ("Albania", "AL"), 
        ("Algeria", "DZ"), 
        ("American Samoa", "AS"), 
        ("AndorrA", "AD"), 
        ("Angola", "AO"), 
        ("Anguilla", "AI"), 
        ("Antarctica", "AQ"), 
        ("Antigua and Barbuda", "AG"), 
        ("Argentina", "AR"), 
        ("Armenia", "AM"), 
        ("Aruba", "AW"), 
        ("Australia", "AU"), 
        ("Austria", "AT"), 
        ("Azerbaijan", "AZ"), 
        ("Bahamas", "BS"), 
        ("Bahrain", "BH"), 
        ("Bangladesh", "BD"), 
        ("Barbados", "BB"), 
        ("Belarus", "BY"), 
        ("Belgium", "BE"), 
        ("Belize", "BZ"), 
        ("Benin", "BJ"), 
        ("Bermuda", "BM"), 
        ("Bhutan", "BT"), 
        ("Bolivia", "BO"), 
        ("Bosnia and Herzegovina", "BA"), 
        ("Botswana", "BW"), 
        ("Bouvet Island", "BV"), 
        ("Brazil", "BR"), 
        ("British Indian Ocean Territory", "IO"), 
        ("Brunei Darussalam", "BN"), 
        ("Bulgaria", "BG"), 
        ("Burkina Faso", "BF"), 
        ("Burundi", "BI"), 
        ("Cambodia", "KH"), 
        ("Cameroon", "CM"), 
        ("Canada", "CA"), 
        ("Cape Verde", "CV"), 
        ("Cayman Islands", "KY"), 
        ("Central African Republic", "CF"), 
        ("Chad", "TD"), 
        ("Chile", "CL"), 
        ("China", "CN"), 
        ("Christmas Island", "CX"), 
        ("Cocos (Keeling) Islands", "CC"), 
        ("Colombia", "CO"), 
        ("Comoros", "KM"), 
        ("Congo", "CG"), 
        ("Congo, The Democratic Republic of the", "CD"), 
        ("Cook Islands", "CK"), 
        ("Costa Rica", "CR"), 
        ("Cote D\"Ivoire", "CI"), 
        ("Croatia", "HR"), 
        ("Cuba", "CU"), 
        ("Cyprus", "CY"), 
        ("Czech Republic", "CZ"), 
        ("Denmark", "DK"), 
        ("Djibouti", "DJ"), 
        ("Dominica", "DM"), 
        ("Dominican Republic", "DO"), 
        ("Ecuador", "EC"), 
        ("Egypt", "EG"), 
        ("El Salvador", "SV"), 
        ("Equatorial Guinea", "GQ"), 
        ("Eritrea", "ER"), 
        ("Estonia", "EE"), 
        ("Ethiopia", "ET"), 
        ("Falkland Islands (Malvinas)", "FK"), 
        ("Faroe Islands", "FO"), 
        ("Fiji", "FJ"), 
        ("Finland", "FI"), 
        ("France", "FR"), 
        ("French Guiana", "GF"), 
        ("French Polynesia", "PF"), 
        ("French Southern Territories", "TF"), 
        ("Gabon", "GA"), 
        ("Gambia", "GM"), 
        ("Georgia", "GE"), 
        ("Germany", "DE"), 
        ("Ghana", "GH"), 
        ("Gibraltar", "GI"), 
        ("Greece", "GR"), 
        ("Greenland", "GL"), 
        ("Grenada", "GD"), 
        ("Guadeloupe", "GP"), 
        ("Guam", "GU"), 
        ("Guatemala", "GT"), 
        ("Guernsey", "GG"), 
        ("Guinea", "GN"), 
        ("Guinea-Bissau", "GW"), 
        ("Guyana", "GY"), 
        ("Haiti", "HT"), 
        ("Heard Island and Mcdonald Islands", "HM"), 
        ("Holy See (Vatican City State)", "VA"), 
        ("Honduras", "HN"), 
        ("Hong Kong", "HK"), 
        ("Hungary", "HU"), 
        ("Iceland", "IS"), 
        ("India", "IN"), 
        ("Indonesia", "ID"), 
        ("Iran, Islamic Republic Of", "IR"), 
        ("Iraq", "IQ"), 
        ("Ireland", "IE"), 
        ("Isle of Man", "IM"), 
        ("Israel", "IL"), 
        ("Italy", "IT"), 
        ("Jamaica", "JM"), 
        ("Japan", "JP"), 
        ("Jersey", "JE"), 
        ("Jordan", "JO"), 
        ("Kazakhstan", "KZ"), 
        ("Kenya", "KE"), 
        ("Kiribati", "KI"), 
        ("Korea, Democratic People\"S Republic of", "KP"), 
        ("Korea, Republic of", "KR"), 
        ("Kuwait", "KW"), 
        ("Kyrgyzstan", "KG"), 
        ("Lao People\"S Democratic Republic", "LA"), 
        ("Latvia", "LV"), 
        ("Lebanon", "LB"), 
        ("Lesotho", "LS"), 
        ("Liberia", "LR"), 
        ("Libyan Arab Jamahiriya", "LY"), 
        ("Liechtenstein", "LI"), 
        ("Lithuania", "LT"), 
        ("Luxembourg", "LU"), 
        ("Macao", "MO"), 
        ("Macedonia, The Former Yugoslav Republic of", "MK"), 
        ("Madagascar", "MG"), 
        ("Malawi", "MW"), 
        ("Malaysia", "MY"), 
        ("Maldives", "MV"), 
        ("Mali", "ML"), 
        ("Malta", "MT"), 
        ("Marshall Islands", "MH"), 
        ("Martinique", "MQ"), 
        ("Mauritania", "MR"), 
        ("Mauritius", "MU"), 
        ("Mayotte", "YT"), 
        ("Mexico", "MX"), 
        ("Micronesia, Federated States of", "FM"), 
        ("Moldova, Republic of", "MD"), 
        ("Monaco", "MC"), 
        ("Mongolia", "MN"), 
        ("Montenegro", "ME"),
        ("Montserrat", "MS"),
        ("Morocco", "MA"), 
        ("Mozambique", "MZ"), 
        ("Myanmar", "MM"), 
        ("Namibia", "NA"), 
        ("Nauru", "NR"), 
        ("Nepal", "NP"), 
        ("Netherlands", "NL"), 
        ("Netherlands Antilles", "AN"), 
        ("New Caledonia", "NC"), 
        ("New Zealand", "NZ"), 
        ("Nicaragua", "NI"), 
        ("Niger", "NE"), 
        ("Nigeria", "NG"), 
        ("Niue", "NU"), 
        ("Norfolk Island", "NF"), 
        ("Northern Mariana Islands", "MP"), 
        ("Norway", "NO"), 
        ("Oman", "OM"), 
        ("Pakistan", "PK"), 
        ("Palau", "PW"), 
        ("Palestinian Territory, Occupied", "PS"), 
        ("Panama", "PA"), 
        ("Papua New Guinea", "PG"), 
        ("Paraguay", "PY"), 
        ("Peru", "PE"), 
        ("Philippines", "PH"), 
        ("Pitcairn", "PN"), 
        ("Poland", "PL"), 
        ("Portugal", "PT"), 
        ("Puerto Rico", "PR"), 
        ("Qatar", "QA"), 
        ("Reunion", "RE"), 
        ("Romania", "RO"), 
        ("Russian Federation", "RU"), 
        ("RWANDA", "RW"), 
        ("Saint Helena", "SH"), 
        ("Saint Kitts and Nevis", "KN"), 
        ("Saint Lucia", "LC"), 
        ("Saint Pierre and Miquelon", "PM"), 
        ("Saint Vincent and the Grenadines", "VC"), 
        ("Samoa", "WS"), 
        ("San Marino", "SM"), 
        ("Sao Tome and Principe", "ST"), 
        ("Saudi Arabia", "SA"), 
        ("Senegal", "SN"), 
        ("Serbia", "RS"), 
        ("Seychelles", "SC"), 
        ("Sierra Leone", "SL"), 
        ("Singapore", "SG"), 
        ("Slovakia", "SK"), 
        ("Slovenia", "SI"), 
        ("Solomon Islands", "SB"), 
        ("Somalia", "SO"), 
        ("South Africa", "ZA"), 
        ("South Georgia and the South Sandwich Islands", "GS"), 
        ("Spain", "ES"), 
        ("Sri Lanka", "LK"), 
        ("Sudan", "SD"), 
        ("Suriname", "SR"), 
        ("Svalbard and Jan Mayen", "SJ"), 
        ("Swaziland", "SZ"), 
        ("Sweden", "SE"), 
        ("Switzerland", "CH"), 
        ("Syrian Arab Republic", "SY"), 
        ("Taiwan, Province of China", "TW"), 
        ("Tajikistan", "TJ"), 
        ("Tanzania, United Republic of", "TZ"), 
        ("Thailand", "TH"), 
        ("Timor-Leste", "TL"), 
        ("Togo", "TG"), 
        ("Tokelau", "TK"), 
        ("Tonga", "TO"), 
        ("Trinidad and Tobago", "TT"), 
        ("Tunisia", "TN"), 
        ("Turkey", "TR"), 
        ("Turkmenistan", "TM"), 
        ("Turks and Caicos Islands", "TC"), 
        ("Tuvalu", "TV"), 
        ("Uganda", "UG"), 
        ("Ukraine", "UA"), 
        ("United Arab Emirates", "AE"), 
        ("United Kingdom", "GB"), 
        ("United States", "US"), 
        ("United States Minor Outlying Islands", "UM"), 
        ("Uruguay", "UY"), 
        ("Uzbekistan", "UZ"), 
        ("Vanuatu", "VU"), 
        ("Venezuela", "VE"), 
        ("Viet Nam", "VN"), 
        ("Virgin Islands, British", "VG"), 
        ("Virgin Islands, U.S.", "VI"), 
        ("Wallis and Futuna", "WF"), 
        ("Western Sahara", "EH"), 
        ("Yemen", "YE"), 
        ("Zambia", "ZM"), 
        ("Zimbabwe", "ZW")
    ];

    for (name, code) in countries {
        sqlx::query("INSERT OR IGNORE INTO countries (id, name, code) VALUES (?, ?, ?)")
            .bind(Uuid::now_v7().to_string())
            .bind(name)
            .bind(code)
            .execute(pool)
            .await?;
    }

    seed_default_admin(pool).await?;

    Ok(())
}

async fn seed_default_admin(pool: &SqlitePool) -> Result<(), Box<dyn std::error::Error>> {
    // Check if any admin exists
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        .fetch_one(pool)
        .await?;

    if count.0 == 0 {
        let password_hash = bcrypt::hash("admin", bcrypt::DEFAULT_COST)?;
        let id = Uuid::now_v7().to_string();

        sqlx::query(
            "INSERT INTO users (id, username, password_hash, full_name, role, is_active) 
             VALUES (?, 'admin', ?, 'System Admin', 'admin', 1)",
        )
        .bind(id)
        .bind(password_hash)
        .execute(pool)
        .await?;
    }

    Ok(())
}
