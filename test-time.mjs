const d = new Date();
const str = d.toLocaleString('sv-SE', { timeZone: 'Asia/Calcutta', hour12: false });
console.log('Original Date:', d.toISOString());
console.log('toLocaleString:', str);
console.log('replaced:', str.replace(' ', 'T'));
