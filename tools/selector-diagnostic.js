// Jira Ticket Logger — Selector Diagnostic Script
// Paste this entire script into the browser DevTools console on a Jira ticket page.
// It will test all DOM selectors and report which ones work.

(function() {
  console.log('=== Jira Ticket Logger: Selector Diagnostic ===\n');

  function test(name, ...strategies) {
    const results = [];
    for (let i = 0; i < strategies.length; i++) {
      try {
        const val = strategies[i]();
        const trimmed = val ? val.trim() : null;
        results.push({ strategy: i + 1, value: trimmed, success: !!trimmed });
      } catch (e) {
        results.push({ strategy: i + 1, value: null, success: false, error: e.message });
      }
    }
    const winner = results.find(r => r.success);
    console.log(`${winner ? '✅' : '❌'} ${name}: ${winner ? '"' + winner.value + '" (strategy ' + winner.strategy + ')' : 'ALL FAILED'}`);
    if (!winner) {
      results.forEach(r => console.log(`   Strategy ${r.strategy}: ${r.error || 'empty/null'}`));
    }
    return { name, results, winner };
  }

  const fields = [];

  // 1. Ticket Number
  fields.push(test('Ticket Number',
    () => { const m = window.location.pathname.match(/\/browse\/([A-Z]+-\d+)/); return m ? m[1] : null; },
    () => document.getElementById('key-val')?.textContent,
    () => document.querySelector('[data-issue-key]')?.getAttribute('data-issue-key')
  ));

  // 2. Reporter
  fields.push(test('Reporter',
    () => document.getElementById('reporter-val')?.textContent,
    () => {
      const labels = document.querySelectorAll('strong, label, .wrap .name, dt');
      for (const el of labels) {
        if (el.textContent.trim().replace(':', '') === 'Reporter') {
          return el.nextElementSibling?.textContent || el.parentElement?.nextElementSibling?.textContent;
        }
      }
      return null;
    }
  ));

  // 3. Assignee
  fields.push(test('Assignee',
    () => document.getElementById('assignee-val')?.textContent,
    () => {
      const labels = document.querySelectorAll('strong, label, .wrap .name, dt');
      for (const el of labels) {
        if (el.textContent.trim().replace(':', '') === 'Assignee') {
          return el.nextElementSibling?.textContent || el.parentElement?.nextElementSibling?.textContent;
        }
      }
      return null;
    }
  ));

  // 4. Description
  fields.push(test('Description',
    () => {
      const toggles = document.querySelectorAll('.aui-toggle-header-button-label, .toggle-title');
      for (const btn of toggles) {
        if (btn.textContent.trim() === 'Description') {
          const section = btn.closest('.module, .aui-toggle-header')?.parentElement;
          if (section) {
            const content = section.querySelector('.user-content-block, .mod-content, .field-ignore-highlight');
            return content?.textContent;
          }
        }
      }
      return null;
    },
    () => document.querySelector('#description-val .user-content-block')?.textContent,
    () => document.querySelector('#descriptionmodule .mod-content')?.textContent,
    () => document.getElementById('description-val')?.textContent
  ));

  // 5. Created Date
  fields.push(test('Created Date',
    () => {
      const el = document.querySelector('#created-val time, #create-date time');
      if (!el) return null;
      const dt = el.getAttribute('datetime');
      if (dt) {
        const d = new Date(dt);
        if (!isNaN(d)) {
          const day = String(d.getDate()).padStart(2, '0');
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          return `${day}/${months[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
        }
      }
      return el.textContent?.trim().replace(/\s+\d{1,2}:\d{2}\s*(AM|PM|am|pm)?.*$/, '');
    },
    () => {
      const labels = document.querySelectorAll('strong, label, .wrap .name, dt');
      for (const el of labels) {
        if (el.textContent.trim().replace(':', '') === 'Created') {
          const val = el.nextElementSibling || el.parentElement?.nextElementSibling;
          const time = val?.querySelector('time');
          return time?.textContent?.trim().replace(/\s+\d{1,2}:\d{2}\s*(AM|PM|am|pm)?.*$/, '') || val?.textContent?.trim();
        }
      }
      return null;
    }
  ));

  // 6. Components
  fields.push(test('Components',
    () => {
      const container = document.getElementById('components-val');
      if (!container) return null;
      const links = container.querySelectorAll('a, span.component');
      return links.length ? Array.from(links).map(l => l.textContent.trim()).filter(Boolean).join(', ') : null;
    },
    () => {
      const container = document.getElementById('components-field');
      if (!container) return null;
      const links = container.querySelectorAll('a, span');
      return links.length ? Array.from(links).map(l => l.textContent.trim()).filter(Boolean).join(', ') : null;
    },
    () => {
      const labels = document.querySelectorAll('strong, label, .wrap .name, dt');
      for (const el of labels) {
        if (el.textContent.trim().replace(':', '') === 'Component/s') {
          return el.nextElementSibling?.textContent || el.parentElement?.nextElementSibling?.textContent;
        }
      }
      return null;
    }
  ));

  // 7. Region (custom field)
  fields.push(test('Region',
    () => document.getElementById('customfield_17039-val')?.textContent,
    () => {
      const el = document.querySelector('[data-field-id="customfield_17039"]');
      return el?.querySelector('.value, .field-value')?.textContent || el?.textContent;
    },
    () => {
      const labels = document.querySelectorAll('strong, label, .wrap .name, dt');
      for (const el of labels) {
        if (el.textContent.trim().replace(':', '') === 'Region') {
          return el.nextElementSibling?.textContent || el.parentElement?.nextElementSibling?.textContent;
        }
      }
      return null;
    }
  ));

  // Summary
  const passed = fields.filter(f => f.winner).length;
  const failed = fields.filter(f => !f.winner).length;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed out of ${fields.length} fields ===`);
  if (failed > 0) {
    console.log('\nFor failed fields, please share the HTML around that field.');
    console.log('Right-click the field value on the page → Inspect → copy the parent element HTML.');
  }
  console.log('\nPlease copy this entire console output and share it back.');
})();
