async function test() {
  const filter = `{!geofilt sfield=geotag pt=37.7749,-122.4194 d=10}`;
  const url = `https://freesound.org/apiv2/search/text/?filter=${encodeURIComponent(filter)}&fields=id,name,previews,location,username&token=test`;
  const res = await fetch(url);
  console.log(await res.text());
}
test();
