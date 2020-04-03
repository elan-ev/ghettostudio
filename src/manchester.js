export async function getIngestInfo(ingestInfoUrl, metaData) {
  const code = metaData.series.key;
  const title = metaData.series.value;
  const visibility = metaData.visibility.key;

  const url = ingestInfoUrl + '?code=' + encodeURIComponent(code) + '&title=' +
    encodeURIComponent(title) + '&visibility=' + encodeURIComponent(visibility);

  const response = await fetch(url, {
    credentials: 'same-origin',
    redirect: 'manual',
  });
  return await response.json();
}