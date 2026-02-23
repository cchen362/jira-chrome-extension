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

  // 4. Description — DO NOT use .closest('.module'), it grabs the entire Details section
  fields.push(test('Description',
    () => {
      const headings = document.querySelectorAll('h2, h3, .toggle-title, .aui-toggle-header-button-label');
      for (const heading of headings) {
        if (heading.textContent.trim() !== 'Description') continue;
        const container = heading.closest('.toggle-wrap, .aui-toggle-header, [id*="description"]');
        if (container) {
          const content = container.querySelector('.user-content-block, .mod-content, .field-ignore-highlight');
          if (content) return content.textContent;
          const next = container.nextElementSibling;
          if (next) {
            const nested = next.querySelector('.user-content-block, .mod-content, .field-ignore-highlight');
            if (nested) return nested.textContent;
            return next.textContent;
          }
        }
        let sibling = heading.parentElement?.nextElementSibling;
        if (sibling) {
          const content = sibling.querySelector('.user-content-block, .mod-content, .field-ignore-highlight');
          if (content) return content.textContent;
        }
      }
      return null;
    },
    () => document.querySelector('#description-val .user-content-block')?.textContent,
    () => document.querySelector('#descriptionmodule .user-content-block')?.textContent,
    () => document.querySelector('#descriptionmodule .mod-content')?.textContent,
    () => document.getElementById('description-val')?.textContent
  ));

  // 5. Created Date — use visible text, NOT datetime attr (UTC causes timezone shift)
  function stripTime(s) {
    if (!s) return null;
    return s.trim().replace(/\s+\d{1,2}:\d{2}\s*(AM|PM|am|pm)?.*$/i, '').trim() || s.trim();
  }
  fields.push(test('Created Date',
    () => {
      const el = document.querySelector('#created-val time, #create-date time');
      return el ? stripTime(el.textContent) : null;
    },
    () => {
      const el = document.getElementById('created-val');
      return el ? stripTime(el.textContent) : null;
    },
    () => {
      const labels = document.querySelectorAll('strong, label, .wrap .name, dt');
      for (const el of labels) {
        if (el.textContent.trim().replace(':', '') === 'Created') {
          const val = el.nextElementSibling || el.parentElement?.nextElementSibling;
          const time = val?.querySelector('time');
          return stripTime(time ? time.textContent : val?.textContent);
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
