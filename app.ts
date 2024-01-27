import qs from 'qs';
import axios from 'axios';

import { load } from 'cheerio';
import { createInterface } from 'readline';

const PLATE_AVAILABLE_NO_REGISTRATION_TEXT = 'var ErrorMessage = alert("Registration not found. Please check the information you entered and try again.");';

const debugMode = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

const verbose = (...args: any[]) => debugMode && console.log(...args);

const extractHeaderValue = (headers: string[], key: string) =>
    headers
        .find(header => header.includes(key))
        ?.split(';')[0]
        .split('=')[1];

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

const client = axios.create({
    withCredentials: true
})

rl.question('Enter plate to check: ', async input => {
    let cookieHeaders: string[] = [];
    let $ = await client
        .get('https://dmvcivls-wselfservice.ct.gov/Registration/VerifyRegistration')
        .then(res => {
            cookieHeaders = res.headers['set-cookie']!;
            return res;
        })
        .then(res => res.data)
        .then(load)
        .catch(console.error);

    if (!$ || !cookieHeaders.length) {
        console.log('Failed to collect cookies or parse inbound HTML, aborting.');
        return process.exit(0);
    }

    let domToken = $('input[name="__RequestVerificationToken"]').attr('value');
    let headerToken = extractHeaderValue(cookieHeaders, '__RequestVerificationToken');
    if (!domToken || !headerToken) return console.error(`Failed to obtain some verification tokens.`);

    verbose('Obtained Verification Tokens:', { domToken, headerToken });

    let data = {
        __RequestVerificationToken: domToken,
        PlateNumber: input.toUpperCase(),
        PlateClassID: '25',
        submitButton: 'Continue'
    };

    verbose('Headers: ', cookieHeaders);
    verbose('Data:', qs.stringify(data));

    if (debugMode) {
        verbose('Natural sleep. zZzZzZz');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    let cookies = [
        `akavpau_wr=${extractHeaderValue(cookieHeaders, 'akavpau_wr')}`,
        `__RequestVerificationToken=${headerToken}`,
    ]

    $ = await client
        .post('https://dmvcivls-wselfservice.ct.gov/Registration/VerifyRegistration', qs.stringify(data), {
            headers: {
                'authority': 'dmvcivls-wselfservice.ct.gov',
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'en-US,en;q=0.9',
                'cache-control': 'max-age=0',
                'content-type': 'application/x-www-form-urlencoded',
                'Cookie': cookies.join('; '),
                'dnt': 1,
                'origin': 'https://dmvcivls-wselfservice.ct.gov',
                'referer': 'https://dmvcivls-wselfservice.ct.gov/Registration/VerifyRegistration',
                'sec-ch-ua': "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\"",
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '\"macOS\"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
        })
        .then(res => res.data)
        .then(res => {
            if (res.includes('The requested page does not exist.'))
                throw new Error('Failed to reach results page.');
            return res;
        })
        .then(load)
        .catch(console.error);

    if (!$) {
        console.log('Failed to parse results page, aborting.');
        return process.exit(0);
    };

    if ($('body').html()!.includes(PLATE_AVAILABLE_NO_REGISTRATION_TEXT)) {
        console.log('Plate is available!');
        process.exit(0);
    }

    let divs = $('div.grid-item_body').toArray();
    let values = divs.map(div => ($ as any)(div).text().trim());

    if (!values.length) {
        console.log('Plate is unavailable. Unable to parse registration info, see CT DMV website.');
        process.exit(0);
    }

    let [plate, plateClass, usage, expiration, state] = values;

    console.log('Plate is unavailable.')
    console.log('-----------------------');
    console.log('Plate:', plate);
    console.log('Class:', plateClass);
    console.log('Usage:', usage);
    console.log('Expiration:', expiration);
    console.log('Disposition:', state);
    console.log('-----------------------');
    process.exit(0);
});