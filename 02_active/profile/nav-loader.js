fetch("/02_active/profile/nav.html")
  .then(res => res.text())
  .then(html => {
    const navDiv = document.getElementById("navbar");
    if (navDiv) {
      navDiv.innerHTML = html;
    }
  });
