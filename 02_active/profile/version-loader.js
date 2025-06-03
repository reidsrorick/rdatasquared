
fetch("/02_active/profile/version.json")
  .then(res => res.json())
  .then(data => {
    const versionDiv = document.getElementById("version");
    if (versionDiv) {
      versionDiv.textContent = `Version ${data.version} — Last updated ${data.lastUpdated}`;
    }
  });
