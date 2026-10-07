(() => {
  const dialog = document.getElementById('docs-dialog');
  let guide;
  // Opened from the menu, or from the splash page before signing in.
  const open = async () => {
    document.getElementById('more-menu').open = false;
    dialog.showModal();
    const content = document.getElementById('docs-content');
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
  document.getElementById('docs-open').onclick = open;
  document.getElementById('splash-docs').onclick = open;
  document.getElementById('docs-close').onclick = () => dialog.close();
})();
