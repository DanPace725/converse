(() => {
  const dialog = document.getElementById('about-dialog');
  let guide;
  document.getElementById('about-open').onclick = async () => {
    document.getElementById('more-menu').open = false;
    dialog.showModal();
    const content = document.getElementById('about-content');
    content.textContent = 'Loading app guide…';
    try {
      if (!guide) {
        const response = await fetch('/app-guide.md');
        if (!response.ok) throw Error('App guide unavailable.');
        guide = await response.text();
      }
      renderReply(content, guide);
    } catch { content.textContent = 'App guide unavailable. Reconnect and try again.'; }
  };
  document.getElementById('about-close').onclick = () => dialog.close();
})();
