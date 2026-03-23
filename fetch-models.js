const fs = require('fs');
fetch('https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyDuBlumIOsIDO66aZTR9FASm19YOQqzAY0').then(r=>r.json()).then(d=>fs.writeFileSync('models.json', JSON.stringify(d.models.map(m=>m.name), null, 2)))
