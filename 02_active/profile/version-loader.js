fetch("/02_active/profile/version.json")
  .then(res => res.json())
  .then(data => {
    const versionDiv = document.getElementById("version");
    if (versionDiv) {
      versionDiv.textContent = data.footer;
    }
  });
