const fs = require('fs');
let s = fs.readFileSync('src/pages/RoadtripPage.jsx', 'utf-8');

// Remove the old overlay buttons block (from "{/* Search area button" to "{/* Modals */}")
const start = s.indexOf('{/* Search area button');
const end = s.indexOf('{/* Modals */}');
if (start >= 0 && end > start) {
  s = s.substring(0, start) + s.substring(end);
  fs.writeFileSync('src/pages/RoadtripPage.jsx', s);
  console.log('OK - removed old overlay buttons block');
} else {
  console.log('Could not find markers: start=' + start + ' end=' + end);
}
