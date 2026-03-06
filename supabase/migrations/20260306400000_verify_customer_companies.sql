-- Verify and update contact info for the three customer companies

-- 1. PKD Express
UPDATE company_profiles
SET is_verified = true,
    phone = '630-413-9669',
    email = 'Pkdexpressllc@gmail.com',
    address = '800 Roosevelt Rd, Building A, Suite 355, Glen Ellyn, IL 60137',
    website = 'www.pkdexpressusa.com'
WHERE company_name ILIKE '%PKD%';

-- 2. United Global Carrier
UPDATE company_profiles
SET is_verified = true,
    phone = '773-627-5960',
    email = 'gedas@ugcarrier.com',
    address = '1338 South Loraine Rd Unit D, Wheaton, IL 60189',
    website = 'https://unitedglobalcarrier.com'
WHERE company_name ILIKE '%United Global Carrier%';

-- 3. ProStar Express Inc
UPDATE company_profiles
SET is_verified = true,
    phone = '773-339-7780',
    email = 'INFO@PROSTAREXPRESS.COM',
    address = '20485 Ela Rd, Barrington, IL 60010',
    website = NULL
WHERE company_name ILIKE '%PROSTAR%' OR company_name ILIKE '%ProStar%';
