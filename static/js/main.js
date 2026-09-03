---
---
$(function() {
  deadlineByConf = {};
  var confDataById = {};

  {% for conf in site.data.conferences %}
  {% assign conf_id = conf.name | append: conf.year | slugify %}
  {% if conf.deadline == "TBA" %}
  $('#{{ conf_id }} .timer').html("TBA");
  $('#{{ conf_id }} .deadline-time').html("TBA");
  deadlineByConf["{{ conf_id }}"] = null;
  confDataById["{{ conf_id }}"] = {
    id: "{{ conf_id }}",
    name: {{ conf.name | jsonify }},
    year: {{ conf.year | jsonify }},
    link: {{ conf.link | jsonify }},
    comment: {{ conf.comment | jsonify }},
    deadline: null
  };

  {% else %}
  var rawDeadlines = {{ conf.deadline | jsonify }} || [];
  if (rawDeadlines.constructor !== Array) {
    rawDeadlines = [rawDeadlines];
  }
  var parsedDeadlines = [];
  while (rawDeadlines.length > 0) {
    var rawDeadline = rawDeadlines.pop();
    // check if date is template
    if (rawDeadline.indexOf('%m') >= 0) {
      for (var m = 1; m <= 12; m++) {
        rawDeadlines.push(rawDeadline.replace('%m', m < 10 ? '0' + m : m));
      }
    } else if (rawDeadline.indexOf('%y') >= 0) {
      year = parseInt(moment().year());
      rawDeadlines.push(rawDeadline.replace('%y', year));
      rawDeadlines.push(rawDeadline.replace('%y', year + 1));

    } else {
      // adjust date according to deadline timezone
      {% if conf.timezone %}
      var deadline = moment.tz(rawDeadline, "{{ conf.timezone }}");
      {% else %}
      var deadline = moment.tz(rawDeadline, "Etc/GMT+12"); // Anywhere on Earth
      {% endif %}

      // post-process date
      if (deadline.minutes() === 0) {
        deadline.subtract(1, 'seconds');
      }
      if (deadline.minutes() === 59) {
        deadline.seconds(59);
      }
      parsedDeadlines.push(deadline);
    }
  }

  // Pick the nearest UPCOMING deadline; if all have passed, use the most recent one.
  // (Previously this seeded on the first list entry and could get stuck on a past date.)
  var today = moment();
  var confDeadline = null;
  for (var i = 0; i < parsedDeadlines.length; i++) {
    var cand = parsedDeadlines[i];
    if (cand.diff(today) >= 0 && (confDeadline === null || cand.isBefore(confDeadline))) {
      confDeadline = cand;
    }
  }
  if (confDeadline === null) {
    for (var i = 0; i < parsedDeadlines.length; i++) {
      var cand = parsedDeadlines[i];
      if (confDeadline === null || cand.isAfter(confDeadline)) confDeadline = cand;
    }
  }

  // render countdown timer
  if (confDeadline) {
    function make_update_countdown_fn(confDeadline) {
      return function(event) {
        diff = moment() - confDeadline
        if (diff <= 0) {
           $(this).html(event.strftime('%D days %Hh %Mm %Ss'));
        } else {
          $(this).html(confDeadline.fromNow());
        }
      }
    }
    $('#{{ conf_id }} .timer').countdown(confDeadline.toDate(), make_update_countdown_fn(confDeadline));

    // urgency classes for color-coding
    var el = $('#{{ conf_id }}');
    if (moment() - confDeadline > 0) {
      el.addClass('past');
    } else {
      var daysLeft = confDeadline.diff(moment(), 'days');
      var cls = daysLeft <= 7 ? 'urgent' : (daysLeft <= 30 ? 'soon' : 'later');
      el.addClass(cls);
      $('#{{ conf_id }} .timer').addClass(cls);
      $('#{{ conf_id }} .add-cal').show();
    }
    $('#{{ conf_id }} .deadline-time').html(confDeadline.local().format('D MMM YYYY, h:mm:ss a'));
    deadlineByConf["{{ conf_id }}"] = confDeadline;
    confDataById["{{ conf_id }}"] = {
      id: "{{ conf_id }}",
      name: {{ conf.name | jsonify }},
      year: {{ conf.year | jsonify }},
      link: {{ conf.link | jsonify }},
      comment: {{ conf.comment | jsonify }},
      deadline: confDeadline
    };
  }
  {% endif %}
  {% endfor %}

  // ---- Add-to-calendar (.ics) ----
  function escICS(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/;/g, '\\;')
      .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsStamp(m) { return m.clone().utc().format('YYYYMMDDTHHmmss') + 'Z'; }
  function buildICS(conf) {
    var dt = conf.deadline;
    var summary = conf.name + ' ' + conf.year + ' — paper deadline';
    var descParts = [];
    if (conf.comment) descParts.push(conf.comment);
    if (conf.link) descParts.push(conf.link);
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'PRODID:-//sys-deadlines//conference deadlines//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + conf.id + '-' + icsStamp(dt) + '@sys-deadlines',
      'DTSTAMP:' + icsStamp(moment()),
      'DTSTART:' + icsStamp(dt),
      'DTEND:' + icsStamp(dt.clone().add(30, 'minutes')),
      'SUMMARY:' + escICS(summary),
      'DESCRIPTION:' + escICS(descParts.join(' — '))
    ];
    if (conf.link) lines.push('URL:' + conf.link);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P7D',
      'DESCRIPTION:' + escICS(summary + ' in one week'), 'END:VALARM');
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1D',
      'DESCRIPTION:' + escICS(summary + ' tomorrow'), 'END:VALARM');
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
  }
  function downloadICS(conf) {
    var blob = new Blob([buildICS(conf)], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (conf.name + conf.year).replace(/[^A-Za-z0-9]+/g, '') + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }
  $('.add-cal').on('click', function(e) {
    e.preventDefault();
    var id = $(this).closest('.conf').attr('id');
    var conf = confDataById[id];
    if (conf && conf.deadline) downloadICS(conf);
  });

  // Reorder list: upcoming (soonest first), then TBA, then past (most recent first)
  confs = $('.conf');
  confs.detach().sort(function(a, b) {
    var today = moment();
    var a = deadlineByConf[a.id];
    var b = deadlineByConf[b.id];
    var diff1 = today.diff(a)
    var diff2 = today.diff(b)
    if (a == null && b == null) {
      return 0;
    }
    if (a == null && diff2 > 0) {
      return -1;
    }
    if (a == null && diff2 < 0) {
      return +1;
    }
    if (b == null && diff1 > 0) {
      return +1;
    }
    if (b == null && diff1 < 0) {
      return -1;
    }
    if (diff1 < 0 && diff2 < 0) {
      return a < b ? -1 : 1;   // both upcoming: earlier deadline first
    }
    if (diff1 > 0 && diff2 > 0) {
      return a > b ? -1 : 1;   // both past: most recently passed first
    }
    if (diff1 < 0 && diff2 > 0) {
      return -1;
    }
    if (diff1 > 0 && diff2 < 0) {
      return +1;
    }
    return 0;
  });
  $('.conf-container').append(confs);

  // Set checkboxes
  var conf_type_data = {{ site.data.types | jsonify }};
  var all_tags = [];
  var toggle_status = {};
  for (var i = 0; i < conf_type_data.length; i++) {
    all_tags[i] = conf_type_data[i]['tag'];
    toggle_status[all_tags[i]] = false;
  }
  // Restore saved filter state. Brand-new categories (not seen on the last
  // visit) default to ON so newly-added conferences aren't silently hidden.
  var tags = store.get('{{ site.domain }}');
  var known = store.get('{{ site.domain }}:known');
  if (tags === undefined) { tags = all_tags.slice(); }
  if (known === undefined) { known = []; }
  for (var i = 0; i < all_tags.length; i++) {
    if (known.indexOf(all_tags[i]) < 0 && tags.indexOf(all_tags[i]) < 0) {
      tags.push(all_tags[i]);
    }
  }
  tags = tags.filter(function(t) { return all_tags.indexOf(t) >= 0; });
  for (var i = 0; i < tags.length; i++) {
    $('#' + tags[i] + '-checkbox').prop('checked', true);
    toggle_status[tags[i]] = true;
  }
  store.set('{{ site.domain }}', tags);
  store.set('{{ site.domain }}:known', all_tags);

  // Master "All topics" checkbox reflects/controls the individual topic boxes.
  function updateAllCheckbox() {
    var on = 0;
    for (var i = 0; i < all_tags.length; i++) {
      if (toggle_status[all_tags[i]]) on++;
    }
    $('#all-checkbox')
      .prop('checked', on === all_tags.length)
      .prop('indeterminate', on > 0 && on < all_tags.length);
  }
  updateAllCheckbox();

  // ---- Filter state ----
  var dayWindow = 0;   // 0 = any
  var hidePast = false;
  var searchTerm = '';

  function update_conf_list() {
    var now = moment();
    confs.each(function(i, elem) {
      var conf = $(elem);
      var id = elem.id;

      // tag filter
      var tagShow = false;
      for (var j = 0; j < all_tags.length; j++) {
        if (conf.hasClass(all_tags[j])) {
          tagShow = tagShow || toggle_status[all_tags[j]];
        }
      }

      var dl = deadlineByConf[id];               // moment, or null for TBA
      var isPast = dl ? (now - dl > 0) : false;
      var daysLeft = dl ? dl.diff(now, 'days') : null;

      // deadline-window filter (excludes TBA and past)
      var windowShow = true;
      if (dayWindow > 0) {
        windowShow = (dl !== null && !isPast && daysLeft <= dayWindow);
      }

      // hide-passed filter (leaves TBA visible)
      var pastShow = true;
      if (hidePast && isPast) pastShow = false;

      // text search
      var searchShow = true;
      if (searchTerm) {
        var hay = (conf.attr('data-search') || '').toLowerCase();
        searchShow = hay.indexOf(searchTerm) >= 0;
      }

      if (tagShow && windowShow && pastShow && searchShow) {
        conf.show();
      } else {
        conf.hide();
      }
    });
  }
  update_conf_list();

  // Event handler on individual topic checkbox change
  $('form :checkbox').not('#all-checkbox').change(function(e) {
    var checked = $(this).is(':checked');
    var tag = $(this).prop('id').slice(0, -9);
    toggle_status[tag] = checked;

    if (checked == true) {
      if (tags.indexOf(tag) < 0)
        tags.push(tag);
    }
    else {
      var idx = tags.indexOf(tag);
      if (idx >= 0)
        tags.splice(idx, 1);
    }
    store.set('{{ site.domain }}', tags);
    updateAllCheckbox();
    update_conf_list();
  });

  // Master "All topics" toggle: check/uncheck every topic at once
  $('#all-checkbox').change(function() {
    var checked = $(this).is(':checked');
    tags = checked ? all_tags.slice() : [];
    for (var i = 0; i < all_tags.length; i++) {
      toggle_status[all_tags[i]] = checked;
      $('#' + all_tags[i] + '-checkbox').prop('checked', checked);
    }
    $(this).prop('indeterminate', false);
    store.set('{{ site.domain }}', tags);
    update_conf_list();
  });

  // Search box
  $('#search-box').on('input', function() {
    searchTerm = $(this).val().trim().toLowerCase();
    update_conf_list();
  });

  // Deadline-window buttons
  $('.win-btn').on('click', function() {
    $('.win-btn').removeClass('active');
    $(this).addClass('active');
    dayWindow = parseInt($(this).attr('data-days'), 10) || 0;
    update_conf_list();
  });

  // Hide-passed toggle
  $('#hide-past').on('change', function() {
    hidePast = $(this).is(':checked');
    update_conf_list();
  });
});
