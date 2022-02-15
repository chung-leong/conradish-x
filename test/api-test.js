const fetchButton = document.getElementById('fetch');
const urlInput = document.getElementById('url');
const outputTextBox = document.getElementById('output');

async function fetchTranslation() {
  const url = urlInput.value;
  try {
    const response = await fetch(url);
    if (response.status !== 200) {
      throw new Error(response.statusText);
    }
    const json = await response.json();
    outputTextBox.value = JSON.stringify(json, undefined, 2);
    outputTextBox.classList.remove('error');
  } catch (e) {
    outputTextBox.value = e.message;
    outputTextBox.classList.add('error');
    console.error(e);
  }
}

fetchButton.addEventListener('click', (evt) => {
  fetchTranslation();
});

urlInput.addEventListener('keypress', (evt) => {
  if (evt.key === 'Enter') {
    fetchTranslation();
  }
});

urlInput.value = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&dt=at&dt=in&dj=1&source=input&sl=en&tl=pl&q=hello`;
