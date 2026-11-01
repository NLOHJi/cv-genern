// @ts-nocheck
(() => {
  // ⚠️ REPLACE THIS WITH YOUR ACTUAL CLOUDFLARE WORKER URL ⚠️
  const WORKER_URL = "YOUR_WORKER_URL_HERE"; 

  const $ = id => document.getElementById(id);
  let portfolio = null;
  let currentAiHtml = null;
  let retryCount = 0;

  const show = id => { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0,0); };

  // ---------- THEME LOGIC ----------
  const btnTheme = $('btn-theme');
  const btnThemeHome = $('btn-theme-home');
  function applyTheme(isLight) {
    document.body.classList.toggle('light', isLight);
    const icon = isLight ? '🌙' : '☀️';
    if(btnTheme) btnTheme.textContent = icon;
    if(btnThemeHome) btnThemeHome.textContent = icon;
  }
  applyTheme(localStorage.getItem('cvgen_lightMode') === 'true');
  function toggleTheme() {
    const isLight = !document.body.classList.contains('light');
    applyTheme(isLight);
    localStorage.setItem('cvgen_lightMode', isLight);
  }
  if(btnTheme) btnTheme.addEventListener('click', toggleTheme);
  if(btnThemeHome) btnThemeHome.addEventListener('click', toggleTheme);

  // ---------- SECURITY & STORAGE ----------
  const encryptData = (data) => { try { return btoa(encodeURIComponent(JSON.stringify(data))); } catch(e) { return null; } };
  const decryptData = (encryptedStr) => { try { return JSON.parse(decodeURIComponent(atob(encryptedStr))); } catch(e) { return null; } };

  function loadStoredPortfolio() {
    const active = localStorage.getItem('cvgen_active_portfolio');
    const backup = localStorage.getItem('cvgen_backup_portfolio');
    if (active) {
      portfolio = decryptData(active);
      if (portfolio) { updateHomeUI(); show('screen-home'); checkPendingJob(); return; }
    } 
    if (backup) {
      portfolio = decryptData(backup);
      if (portfolio) {
        localStorage.setItem('cvgen_active_portfolio', encryptData(portfolio)); 
        updateHomeUI(); show('screen-home'); checkPendingJob(); return;
      }
    }
    show('screen-import');
  }

  $('json-import').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        portfolio = data;
        const encrypted = encryptData(data);
        localStorage.setItem('cvgen_active_portfolio', encrypted); 
        localStorage.setItem('cvgen_backup_portfolio', encrypted); 
        updateHomeUI(); show('screen-home'); checkPendingJob();
      } catch (err) { alert('Invalid JSON file.'); }
    };
    reader.readAsText(file);
  });

  function updateHomeUI() {
    if (!portfolio) return;
    $('active-name').textContent = portfolio.personal.fullName || 'Unknown Name';
    $('active-headline').textContent = portfolio.personal.headline || 'No headline provided';
    $('extra-address').value = portfolio.personal.location || '';
  }

  // ---------- JOB RESUMPTION ----------
  function checkPendingJob() {
    const pending = localStorage.getItem('pending_ai_job');
    if (pending) {
      const job = JSON.parse(pending);
      startBannerPolling(job.payload);
    }
  }

  // ---------- GENERATE LOGIC ----------
  $('btn-do-generate').addEventListener('click', async () => {
    if (!portfolio) return;
    
    const docType = $('doc-type').value;
    const jobTitle = $('job-title').value || 'the position';
    const company = $('company').value || 'your organization';
    const useAI = $('use-ai').checked;
    const jobAdText = $('job-ad').value || '';

    if (!useAI && uploadedFileData) return alert("You uploaded a file. Pro AI is required to read it.");

    if (docType === 'normal_cv') {
      portfolio.personal.address = $('extra-address').value;
      portfolio.personal.dob = $('extra-dob').value;
      portfolio.personal.nationality = $('extra-nationality').value;
    }

    if (useAI && (docType === 'cover_letter' || docType === 'application_letter')) {
      const phone = localStorage.getItem('pro_phone');
      if (!phone) return alert("Please request Pro Access first.");
      
      const payload = { 
        action: "generate", phone: phone, type: docType, jobTitle, company, 
        degree: portfolio.education[0]?.degree || "my degree", 
        skills: portfolio.skills.flatMap(g => g.items).slice(0,4).join(", ") || "my skills",
        jobAdText, fileData: uploadedFileData, fileType: uploadedFileType
      };
      
      localStorage.setItem('pending_ai_job', JSON.stringify({ payload }));
      retryCount = 0;
      
      show('screen-home');
      startBannerPolling(payload);

    } else {
      // OFFLINE GENERATION (Powered by the Heuristic Engine)
      let html = '';
      if (docType === 'professional_cv') html = buildProfessionalCV(portfolio);
      else if (docType === 'normal_cv') html = buildNormalCV(portfolio);
      else if (docType === 'cover_letter') html = buildSmartLetter(portfolio, 'cover', jobTitle, company);
      else if (docType === 'application_letter') html = buildSmartLetter(portfolio, 'application', jobTitle, company);
      
      $('preview-frame').srcdoc = html; show('screen-preview');
    }
  });

  // ---------- THE APP RETRY LOOP ----------
  async function startBannerPolling(payload) {
    const banner = $('ai-status-banner'); const bText = $('banner-text'); const bBtn = $('btn-view-doc');
    banner.style.display = 'block'; banner.style.background = '#fef3c7'; banner.style.color = '#92400e';
    bText.textContent = `⏳ Connecting to AI... (Attempt ${retryCount + 1}/6)`; bBtn.style.display = 'none';

    try {
      const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 503 && retryCount < 5) {
          retryCount++;
          bText.textContent = `⏳ Google is busy. Retrying... (${retryCount}/6)`;
          setTimeout(() => startBannerPolling(payload), 10000);
          return;
        }
        throw new Error(data.error || "Failed to generate");
      }

      localStorage.removeItem('pending_ai_job');
      banner.style.background = '#d1fae5'; banner.style.color = '#065f46';
      bText.textContent = `✅ Document Ready! (${data.creditsUsed}/12 credits used)`;
      bBtn.style.display = 'block';
      
      let aiTemplate = data.text.replace(/\[NAME\]/g, portfolio.personal.fullName).replace(/\[PHONE\]/g, portfolio.personal.phone).replace(/\[EMAIL\]/g, portfolio.personal.email);
      currentAiHtml = buildLetterFromTemplate(aiTemplate);

    } catch (e) {
      localStorage.removeItem('pending_ai_job');
      banner.style.background = '#fee2e2'; banner.style.color = '#991b1b';
      bText.textContent = `❌ ${e.message}`;
    }
  }

  $('btn-view-doc').addEventListener('click', () => {
    if (currentAiHtml) { $('preview-frame').srcdoc = currentAiHtml; show('screen-preview'); }
  });

  $('btn-print').addEventListener('click', () => { 
    const htmlContent = $('preview-frame').srcdoc;
    if (window.AndroidPrint && window.AndroidPrint.printPage) window.AndroidPrint.printPage(htmlContent);
    else { $('preview-frame').contentWindow.focus(); $('preview-frame').contentWindow.print(); }
  });
  
  document.querySelectorAll('[data-home], [data-back]').forEach(b => b.addEventListener('click', () => show('screen-home')));
  $('btn-go-generate').addEventListener('click', () => show('screen-generate'));

  // ---------- FILE UPLOAD ----------
  let uploadedFileData = null; 
  let uploadedFileType = null;

  window.clearJobFile = function() {
    uploadedFileData = null; uploadedFileType = null;
    $('job-ad-file').value = ''; $('file-status').style.display = 'none';
    $('btn-clear-file').style.display = 'none'; $('job-ad').value = '';
  };

  $('job-ad-file').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader(); const status = $('file-status');
    status.style.display = 'block'; status.textContent = "⏳ Reading file...";
    $('btn-clear-file').style.display = 'block';

    if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      reader.onload = ev => { $('job-ad').value = ev.target.result; status.textContent = `✅ Text loaded: ${file.name}`; uploadedFileData = null; };
      reader.readAsText(file);
    } else {
      reader.onload = ev => { uploadedFileData = ev.target.result; uploadedFileType = file.type; $('job-ad').value = ''; status.textContent = `✅ Attached: ${file.name}`; };
      reader.readAsDataURL(file);
    }
  });

  // ---------- AI AUTH ----------
  $('use-ai').addEventListener('change', async (e) => {
    if (e.target.checked) {
      $('ai-auth-box').style.display = 'block';
      $('btn-request-access').style.display = 'block';
      
      const savedPhone = localStorage.getItem('pro_phone');
      if (savedPhone) {
        $('pro-phone').value = savedPhone; $('pro-phone').disabled = true;
        $('pin-setup-group').style.display = 'none'; $('pin-verify-group').style.display = 'none';
        $('auth-status').textContent = "⏳ Verifying Pro status...";
        
        try {
          const res = await fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check_status", phone: savedPhone }) });
          const data = await res.json();
          
          if (data.status === "approved") {
            $('auth-status').textContent = `✅ Pro AI Active (${12 - data.credits} credits left)`;
            $('auth-status').style.color = "#10b981"; 
            $('btn-request-access').style.display = 'none';
          } else if (data.status === "revoked") {
            $('auth-status').textContent = "⚠️ Credits used up. Contact admin to renew.";
            $('auth-status').style.color = "#ef4444";
            $('btn-request-access').textContent = "Request Renewal";
          } else {
            $('auth-status').textContent = "❌ Not active. Please request access.";
            $('auth-status').style.color = "#ef4444";
            $('btn-request-access').textContent = "Request Access";
          }
        } catch (err) { $('auth-status').textContent = "❌ Network error."; $('auth-status').style.color = "#ef4444"; }
      } else {
        $('pin-setup-group').style.display = 'block'; $('pin-verify-group').style.display = 'none';
        $('auth-status').textContent = "First time setup: Create a PIN and request access.";
        $('auth-status').style.color = "#8b5cf6";
      }
    } else { $('ai-auth-box').style.display = 'none'; }
  });

  $('btn-request-access').addEventListener('click', async () => {
    const phone = $('pro-phone').value, pin = $('pro-pin-setup').value || $('pro-pin-verify').value;
    if (!phone) return alert("Enter phone number.");
    $('auth-status').textContent = "⏳ Requesting..."; $('btn-request-access').disabled = true;
    try {
      const res = await fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request_access", phone, pin }) });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('pro_phone', phone); if ($('pro-pin-setup').value) localStorage.setItem('pro_pin', $('pro-pin-setup').value);
        $('auth-status').textContent = "✅ " + data.message; $('auth-status').style.color = "#10b981";
      } else { $('auth-status').textContent = "❌ " + data.error; $('auth-status').style.color = "#ef4444"; }
    } catch (e) { $('auth-status').textContent = "❌ Network error."; $('auth-status').style.color = "#ef4444"; }
    $('btn-request-access').disabled = false;
  });

  // =========================================================
  // 🧠 THE OFFLINE AI LIBRARY (HEURISTIC TEXT GENERATOR)
  // =========================================================
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function generateSmartSummary(p) {
    const name = p.personal.fullName.split(' ')[0] || 'The candidate';
    const degree = p.education[0]?.degree || "a strong academic background";
    const school = p.education[0]?.school || "a recognized institution";
    const skills = p.skills.flatMap(g => g.items).slice(0, 3).join(", ") || "various professional skills";
    
    return `${name} is a dedicated professional with ${degree} from ${school}. Possessing strong expertise in ${skills}, ${name} is committed to delivering high-quality results and contributing effectively to a dynamic team.`;
  }

  function buildProfessionalCV(p) {
    const d = p.personal;
    const summary = p.about || generateSmartSummary(p);
    const allSkills = p.skills.flatMap(g => g.items);

    let html = `<html><head><meta charset="utf-8"><style>
      body{font-family:Georgia,serif;font-size:13px;line-height:1.6;color:#222;padding:40px;max-width:800px;margin:0 auto}
      h1{font-size:26px;text-align:center;margin:0 0 4px;letter-spacing:1px;color:#111}
      .contact{text-align:center;font-size:12px;color:#555;margin-bottom:30px;border-bottom:1px solid #ccc;padding-bottom:15px}
      h2{font-size:14px;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:4px;margin-top:25px;letter-spacing:1px}
      .item{margin-bottom:15px}
      .item strong{font-size:14px;display:block;color:#000}
      .item em{color:#666;font-size:12px;display:block;margin-bottom:5px}
      ul{margin:5px 0;padding-left:20px}
      li{margin-bottom:4px}
      p{margin:5px 0}
    </style></head><body>`;
    
    html += `<h1>${esc(d.fullName)}</h1>`;
    html += `<div class="contact">${esc(d.phone)} | ${esc(d.email)} | ${esc(d.location)}</div>`;
    
    html += `<h2>Professional Summary</h2><p>${esc(summary)}</p>`;
    
    if (p.experience.length) {
      html += `<h2>Work Experience</h2>`;
      p.experience.forEach(e => {
        html += `<div class="item"><strong>${esc(e.role)}</strong><em>${esc(e.company)} | ${esc(e.period)}</em><ul>`;
        if (e.description) {
          const bullets = e.description.split('\n').filter(x => x.trim() !== '');
          bullets.forEach(b => html += `<li>${esc(b)}</li>`);
        }
        html += `</ul></div>`;
      });
    }

    if (p.education.length) {
      html += `<h2>Education</h2>`;
      p.education.forEach(e => {
        html += `<div class="item"><strong>${esc(e.degree)}</strong><em>${esc(e.school)} | ${esc(e.period)}</em></div>`;
      });
    }

    if (allSkills.length) {
      html += `<h2>Core Competencies</h2><ul>`;
      allSkills.forEach(s => html += `<li>${esc(s)}</li>`);
      html += `</ul>`;
    }

    if (p.languages.length) {
      html += `<h2>Languages</h2><ul>`;
      p.languages.forEach(l => html += `<li>${esc(l.name)} – ${esc(l.level)}</li>`);
      html += `</ul>`;
    }
    
    html += `</body></html>`;
    return html;
  }

  function buildNormalCV(p) {
    const d = p.personal;
    let html = `<html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#111;padding:30px}
      h1{font-size:22px;text-align:center;margin:0;letter-spacing:3px}
      .contact{text-align:center;font-size:12px;margin:8px 0 20px}
      h2{font-size:14px;background:#eee;padding:6px 8px;margin-top:20px;border-left:4px solid #333}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      td,th{border:1px solid #999;padding:6px 8px;font-size:12px;vertical-align:top}
      th{background:#f3f3f3;text-align:left;font-weight:bold}
      ul{margin:5px 0;padding-left:20px}
      .declaration{margin-top:30px;font-size:12px;font-style:italic}
    </style></head><body>`;
    
    html += `<h1>CURRICULUM VITAE</h1>`;
    html += `<div class="contact"><strong>${esc(d.fullName)}</strong><br>Phone: ${esc(d.phone)} | Email: ${esc(d.email)}<br>`;
    const addr = []; if (d.address) addr.push(`Address: ${esc(d.address)}`); if (d.dob) addr.push(`DOB: ${esc(d.dob)}`); if (d.nationality) addr.push(`Nationality: ${esc(d.nationality)}`);
    html += addr.join(' | ') + `</div>`;

    if (p.education.length) {
      html += `<h2>1. EDUCATION BACKGROUND</h2><table><tr><th style="width:20%">Period</th><th style="width:40%">School</th><th style="width:40%">Certificate</th></tr>`;
      p.education.forEach(e => html += `<tr><td>${esc(e.period)}</td><td>${esc(e.school)}</td><td>${esc(e.degree)}</td></tr>`);
      html += `</table>`;
    }

    if (p.experience.length) {
      html += `<h2>2. WORK EXPERIENCE</h2><table><tr><th style="width:20%">Period</th><th style="width:30%">Place</th><th style="width:50%">Task Done</th></tr>`;
      p.experience.forEach(e => html += `<tr><td>${esc(e.period)}</td><td>${esc(e.company)}</td><td>${esc(e.description)}</td></tr>`);
      html += `</table>`;
    }

    html += `<h2>3. SKILLS</h2><ul>`;
    p.skills.forEach(g => {
      if (g.items.length) html += `<li><strong>${esc(g.category)}:</strong> ${g.items.map(esc).join(', ')}</li>`;
    });
    if (p.languages.length) html += `<li><strong>Languages:</strong> ${p.languages.map(l => `${esc(l.name)} (${esc(l.level)})`).join(', ')}</li>`;
    html += `</ul>`;

    if (p.references.length) {
      html += `<h2>4. REFERENCES</h2><ul>`;
      p.references.forEach((r) => html += `<li>${esc(r.name)} – ${esc(r.role)}, ${esc(r.organization)} (${esc(r.phone)})</li>`);
      html += `</ul>`;
    }

    // The Rwandan Declaration
    html += `<div class="declaration"><p>I declare that the information provided above is true and correct to the best of my knowledge.</p></div>`;
    
    html += `</body></html>`;
    return html;
  }

  // 🚀 THE SMART LETTER GENERATOR (Offline AI)
  function buildSmartLetter(p, kind, jobTitle, company) {
    const d = p.personal;
    const firstName = d.fullName.split(' ')[0] || d.fullName;
    const degree = p.education[0]?.degree || "my academic background";
    const school = p.education[0]?.school || "my institution";
    
    // Grab the top 3 skills to weave into the text
    const topSkills = p.skills.flatMap(g => g.items).slice(0, 3);
    const skillString = topSkills.length > 1 ? topSkills.slice(0, -1).join(", ") + " and " + topSkills[topSkills.length - 1] : topSkills[0] || "relevant professional skills";

    let body = '';

    if (kind === 'application') {
      // Rwandan Formal Application Letter
      body = `Dear Sir/Madam,

RE: APPLICATION FOR THE POSITION OF ${jobTitle.toUpperCase()}

I am writing to formally express my interest in the ${jobTitle} position at ${company}. 

Having recently completed my ${degree} at ${school}, I have developed a robust foundation in ${skillString}. Through my academic projects and practical experiences, I have learned to apply these skills effectively to solve real-world problems. I am confident that my technical background and dedication to excellence align perfectly with the requirements of this role.

I have followed ${company}'s work with great interest and would be honored to contribute to your team. I am a highly motivated individual with a strong work ethic, eager to bring value to your esteemed organization.

Thank you for considering my application. I have attached my CV for your review and look forward to the opportunity to discuss my qualifications further.

Yours faithfully,

${d.fullName}
${d.phone} | ${d.email}`;
    } else {
      // Modern, Persuasive Cover Letter
      body = `Dear Hiring Manager,

I am writing to express my strong enthusiasm for the ${jobTitle} position at ${company}. 

As a professional with a ${degree} from ${school}, I have honed my expertise in ${skillString}. What sets me apart is not just my technical ability, but my drive to deliver tangible results. I thrive in collaborative environments and take pride in approaching challenges with a problem-solving mindset.

I am particularly drawn to ${company} because of your innovative reputation in the industry. I am eager to bring my skills and proactive attitude to your team, and I am confident that my background will allow me to make a meaningful contribution to your upcoming projects.

Thank you for your time and consideration. I would welcome the opportunity to discuss how my qualifications align with the goals of your team.

Sincerely,

${d.fullName}
${d.phone} | ${d.email}`;
    }

    return `<html><head><meta charset="utf-8"><style>
      body{font-family:Georgia,serif;font-size:13px;line-height:1.8;padding:50px;color:#222;max-width:800px;margin:0 auto}
      .header{margin-bottom:40px;border-bottom:1px solid #ccc;padding-bottom:15px}
      .header strong{font-size:18px;display:block;margin-bottom:5px}
      .header span{color:#555;font-size:12px}
      pre{white-space:pre-wrap;font-family:inherit;margin:0}
    </style></head><body>
      <div class="header">
        <strong>${esc(d.fullName)}</strong>
        <span>${esc(d.phone)} | ${esc(d.email)} | ${esc(d.location)}</span>
      </div>
      <pre>${esc(body)}</pre>
    </body></html>`;
  }

  function buildLetterFromTemplate(templateText) {
    return `<html><head><meta charset="utf-8"><style>
      body{font-family:Georgia,serif;font-size:13px;line-height:1.8;padding:50px;color:#222;max-width:800px;margin:0 auto}
      pre{white-space:pre-wrap;font-family:inherit;margin:0}
    </style></head><body><pre>${esc(templateText)}</pre></body></html>`;
  }

  loadStoredPortfolio();
})();