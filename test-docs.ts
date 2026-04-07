async function test() {
  const res = await fetch('https://freesound.org/docs/api/resources_apiv2.html');
  const text = await res.text();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('geotag')) {
      console.log('--- MATCH ---');
      console.log(lines.slice(Math.max(0, i - 2), i + 3).join('\n'));
    }
  }
}
test();
