const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('fluxbase_features_detailed.pdf');

pdf(dataBuffer).then(function (data) {
    console.log(data.text);
}).catch(function (err) {
    console.error("PDF Parse Error:", err);
});
