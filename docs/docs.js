(function () {
  const pageVersion = document.body.dataset.version;
  const versions = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'brainfrick', 'malbolge'];
  const header = document.createElement('header');
  header.innerHTML = `
    <center>
      <h1>LOGIFUNGE DOCUMENTATION</h1>
      <p><i>A two-dimensional language of movement, stacks, and logic gates.</i></p>
    </center>
    <hr>
    <p align="right">Version:
      <select id="version-select" aria-label="Documentation version"></select>
    </p>`;
  document.body.prepend(header);
  const select = header.querySelector('#version-select');
  versions.forEach(version => {
    const option = document.createElement('option');
    option.value = version;
    option.textContent = version.toUpperCase();
    option.selected = version === pageVersion;
    select.append(option);
  });
  select.addEventListener('change', () => {
    window.location.href = `../${select.value}/`;
  });
})();
