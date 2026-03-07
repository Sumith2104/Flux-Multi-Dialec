const fs = require('fs');
const d = JSON.parse(fs.readFileSync('tmp/fluxbase_features_detailed.json'));
let t = '';
d.formImage.Pages.forEach(p => {
    p.Texts.forEach(x => {
        try {
            t += decodeURIComponent(x.R[0].T) + ' ';
        } catch (e) { }
    });
    t += '\n';
});
console.log(t);
fs.writeFileSync('tmp/features.txt', t);
