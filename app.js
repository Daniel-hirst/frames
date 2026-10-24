/* Frames: UI and routing. */
(function () {
  'use strict';

  // Logger mode = a GitHub token is saved on this device.
  // For testing, ?mode=readonly or ?mode=logger overrides it.
  const modeParam = new URLSearchParams(location.search).get('mode');
  const isLogger = modeParam ? modeParam === 'logger' : !!localStorage.getItem('frames.token');

  const SCREENS = {
    session:  { eyebrow: 'Session',           title: 'New session' },
    stats:    { eyebrow: 'All time',          title: 'Stats' },
    charts:   { eyebrow: 'All time',          title: 'Charts' },
    history:  { eyebrow: 'History',           title: 'History' },
    settings: { eyebrow: 'Only you see this', title: 'Settings' }
  };

  let lastTab = isLogger ? 'session' : 'stats';

  function route() {
    let name = location.hash.slice(1);
    // #settings always works, so Dan can add a token on a new device.
    if (!SCREENS[name] || (name === 'session' && !isLogger)) {
      name = isLogger ? 'session' : 'stats';
      history.replaceState(null, '', '#' + name);
    }
    if (name !== 'settings') lastTab = name;

    $('.screen').attr('hidden', true);
    $('#screen-' + name).removeAttr('hidden');
    $('#eyebrow').text(SCREENS[name].eyebrow);
    $('#title').text(SCREENS[name].title);
    $('.tab').removeClass('active').removeAttr('aria-current');
    $('.tab[data-route="' + name + '"]').addClass('active').attr('aria-current', 'page');

    const onSettings = name === 'settings';
    $('#settings-btn').toggleClass('d-none', onSettings);
    $('#close-btn').toggleClass('d-none', !onSettings).attr('href', '#' + lastTab);
    window.scrollTo(0, 0);
  }

  $(function () {
    $('body').toggleClass('readonly', !isLogger);
    $(window).on('hashchange', route);
    route();
  });
})();
