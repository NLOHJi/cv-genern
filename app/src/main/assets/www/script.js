// @ts-nocheck
(() => {
  // ⚠️ REPLACE THIS WITH YOUR ACTUAL CLOUDFLARE WORKER URL ⚠️
  const WORKER_URL = "https://cv-gen-ai.justinwc8.workers.dev/"; 

  const $ = id => document.getElementById(id);
  let portfolio = null;

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
      if (portfolio) { updateHomeUI(); show('screen-home'); return; }
    } 
    if (backup) {
      portfolio = decryptData(backup);
      if (portfolio) {
        localStorage.setItem('cvgen_active_portfolio', encryptData(portfolio)); 
        updateHomeUI(); show('screen-home'); return;
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
        updateHomeUI(); show('screen-home');
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

  $('doc-type').addEventListener('change', e => { $('extra-fields').style.display = (e.target.value === 'normal_cv') ? 'block' : 'none'; });

  // ---------- UNIFIED FILE UPLOAD LOGIC ----------
  let uploadedFileData = null; 
  let uploadedFileType = null;

  window.clearJobFile = function() {
    uploadedFileData = null;
    uploadedFileType = null;
    $('job-ad-file').value = '';
    $('file-status').style.display = 'none';
    $('btn-clear-file').style.display = 'none';
    $('job-ad').value = '';
  };

  $('job-ad-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    const status = $('file-status');
    status.style.display = 'block';
    status.textContent = "⏳ Reading file...";
    $('btn-clear-file').style.display = 'block';

    if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      reader.onload = ev => {
        $('job-ad').value = ev.target.result;
        status.textContent = `✅ Text loaded: ${file.name}`;
        uploadedFileData = null; 
      };
      reader.readAsText(file);
    } else {
      reader.onload = ev => {
        uploadedFileData = ev.target.result; 
        uploadedFileType = file.type;
        $('job-ad').value = ''; 
        status.textContent = `✅ Attached: ${file.name} (AI will read this)`;
      };
      reader.readAsDataURL(file);
    }
  });

  // ---------- AI AUTH & REQUEST ACCESS ----------
  $('use-ai').addEventListener('change', async (e) => {
    const banner = $('ai-status-banner');
    if (e.target.checked) {
      $('ai-auth-box').style.display = 'block';
      $('btn-verify').style.display = 'block';
      
      const savedPhone = localStorage.getItem('pro_phone');
      if (savedPhone) {
        $('pro-phone').value = savedPhone; 
        $('pro-phone').disabled = true;
        $('pin-setup-group').style.display = 'none'; 
        $('pin-verify-group').style.display = 'none';
        $('auth-status').textContent = "⏳ Verifying Pro status...";
        
        try {
          const res = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "check_status", phone: savedPhone })
          });
          const data = await res.json();
          
          if (data.status === "approved") {
         $('auth-status').textContent = `✅ Pro AI Active (${12 - data.credits} credits left)`;
         $('auth-status').style.color = "#10b981"; 

} else if (data.status === "revoked") {
  $('auth-status').textContent = "⚠️ Your 12 credits are used up. Please renew.";
  $('auth-status').style.color = "#ef4444";
  $('btn-verify').textContent = "Request Renewal";
  $('btn-verify').style.display = 'block';
  banner.style.display = 'none';

} else if (data.status === "pending") {
            // CHECK AI AVAILABILITY
            banner.style.display = 'block';
            banner.style.background = '#f3f4f6';
            banner.style.color = '#374151';
            banner.textContent = "⏳ Checking AI availability...";
            
            const aiRes = await fetch(WORKER_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "check_ai_status" })
            });
            const aiData = await aiRes.json();
            
            if (aiData.status === "online") {
              banner.style.background = '#d1fae5';
              banner.style.color = '#065f46';
              banner.textContent = aiData.message;
            } else if (aiData.status === "limit_reached") {
              banner.style.background = '#fee2e2';
              banner.style.color = '#991b1b';
              banner.textContent = aiData.message;
            } else {
              banner.style.background = '#fef3c7';
              banner.style.color = '#92400e';
              banner.textContent = "⚠️ " + aiData.message;
            }
            
          } else if (data.status === "pending") {
            $('auth-status').textContent = "⏳ Pending approval.";
            $('auth-status').style.color = "#f59e0b";
            $('btn-verify').textContent = "Re-send Request";
            banner.style.display = 'none';
          } else {
            $('auth-status').textContent = "❌ Not active. Please verify your number.";
            $('auth-status').style.color = "#ef4444";
            $('btn-verify').textContent = "Request Access";
            banner.style.display = 'none';
          }
        } catch (err) {
          $('auth-status').textContent = "❌ Can't connect to Cloud.";
          $('auth-status').style.color = "#ef4444";
        }
      } else {
        $('pin-setup-group').style.display = 'block'; 
        $('pin-verify-group').style.display = 'none';
        $('auth-status').textContent = "First time setup: Create a PIN and verify.";
        $('auth-status').style.color = "#8b5cf6";
        banner.style.display = 'none';
      }
    } else { 
      $('ai-auth-box').style.display = 'none'; 
      banner.style.display = 'none';
    }
  });

  $('btn-verify').addEventListener('click', async () => {
    const phone = $('pro-phone').value;
    const pinSetup = $('pro-pin-setup').value;
    const pinVerify = $('pro-pin-verify').value;
    
    if (!phone) return alert("Please enter your phone number.");
    
    $('auth-status').textContent = "⏳ Requesting access...";
    $('auth-status').style.color = "#8b5cf6";
    $('btn-verify').textContent = "Verifying...";
    $('btn-verify').disabled = true;
    
    try {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", phone: phone, pin: pinSetup || pinVerify })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem('pro_phone', phone);
        if (pinSetup) localStorage.setItem('pro_pin', pinSetup);
        
        $('auth-status').textContent = "✅ " + data.message;
        $('auth-status').style.color = "#10b981";
        $('btn-verify').textContent = "Re-send Request";
      } else {
        $('auth-status').textContent = "❌ " + (data.error || "Failed to request");
        $('auth-status').style.color = "#ef4444";
        $('btn-verify').textContent = "Request Access";
      }
    } catch (e) {
      $('auth-status').textContent = "❌ Network error. Check Worker URL.";
      $('auth-status').style.color = "#ef4444";
      $('btn-verify').textContent = "Request Access";
    }
    
    $('btn-verify').disabled = false;
  });

  // ---------- GENERATION ----------
  $('btn-do-generate').addEventListener('click', async () => {
    if (!portfolio) return;
    
    const docType = $('doc-type').value;
    const jobTitle = $('job-title').value || 'the position';
    const company = $('company').value || 'your organization';
    const useAI = $('use-ai').checked;
    const jobAdText = $('job-ad').value || '';

    if (!useAI && uploadedFileData) {
      alert("You uploaded a file. Pro AI is required to read images, PDFs, or Docs. Please check the 'Use Pro Cloud AI' box.");
      return;
    }

    if (docType === 'normal_cv') {
      portfolio.personal.address = $('extra-address').value;
      portfolio.personal.dob = $('extra-dob').value;
      portfolio.personal.nationality = $('extra-nationality').value;
    }

    const btn = $('btn-do-generate'), originalText = btn.textContent; 
    let html = '';

    if (useAI && (docType === 'cover_letter' || docType === 'application_letter')) {
      btn.textContent = 'Connecting to Cloud AI...'; 
      btn.disabled = true;
      
      const phone = localStorage.getItem('pro_phone');
      if (!phone) {
         alert("Please request Pro Access first.");
         btn.textContent = originalText; btn.disabled = false;
         return;
      }
      
      const safePayload = { 
        action: "generate", phone: phone, type: docType, jobTitle: jobTitle, company: company, 
        degree: portfolio.education[0]?.degree || "my degree", 
        skills: portfolio.skills.technical?.slice(0,3).join(", ") || "my skills",
        jobAdText: jobAdText, fileData: uploadedFileData, fileType: uploadedFileType
      };
      
      try {
        const response = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(safePayload)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate");
        }
        
        let aiTemplate = data.text;
        aiTemplate = aiTemplate.replace(/\[NAME\]/g, portfolio.personal.fullName).replace(/\[PHONE\]/g, portfolio.personal.phone).replace(/\[EMAIL\]/g, portfolio.personal.email);
        html = buildLetterFromTemplate(aiTemplate);
        
      } catch (e) { 
        alert('AI Error: ' + e.message); 
        html = buildLetter(portfolio, docType === 'cover_letter' ? 'cover' : 'application', jobTitle, company); 
      }
      btn.textContent = originalText; btn.disabled = false;
    } else {
      if (docType === 'professional_cv') html = buildProfessionalCV(portfolio);
      else if (docType === 'normal_cv') html = buildNormalCV(portfolio);
      else if (docType === 'cover_letter') html = buildLetter(portfolio, 'cover', jobTitle, company);
      else if (docType === 'application_letter') html = buildLetter(portfolio, 'application', jobTitle, company);
    }
    
    $('preview-frame').srcdoc = html; 
    show('screen-preview');
  });

  // ---------- NATIVE ANDROID PRINT HOOK ----------
  $('btn-print').addEventListener('click', () => { 
    const htmlContent = $('preview-frame').srcdoc;
    
    if (window.AndroidPrint && window.AndroidPrint.printPage) {
      window.AndroidPrint.printPage(htmlContent);
    } else {
      $('preview-frame').contentWindow.focus(); 
      $('preview-frame').contentWindow.print(); 
    }
  });
  
  document.querySelectorAll('[data-home], [data-back]').forEach(b => b.addEventListener('click', () => show('screen-home')));
  $('btn-go-generate').addEventListener('click', () => show('screen-generate'));

  // ---------- OFFLINE TEMPLATES ----------
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function buildProfessionalCV(p) {
    const d = p.personal, out = [];
    out.push(`<html><head><meta charset="utf-8"><style>body{font-family:Georgia,serif;font-size:12px;line-height:1.5;color:#222;padding:40px;max-width:800px;margin:0 auto}h1{font-size:22px;text-align:center;margin:0 0 4px;letter-spacing:2px}.contact{text-align:center;font-size:11px;margin-bottom:18px}h2{font-size:12px;text-transform:uppercase;border-bottom:1px solid #444;padding-bottom:2px;margin-top:18px;letter-spacing:1px}.item{margin-bottom:8px}.item strong{display:block}ul{margin:4px 0;padding-left:20px}p{margin:4px 0}</style></head><body>`);
    out.push(`<h1>${esc(d.fullName)}</h1><div class="contact">${esc(d.phone)} | ${esc(d.email)} | ${esc(d.location)}</div>`);
    if (p.about) out.push(`<h2>Professional Profile</h2><p>${esc(p.about)}</p>`);
    if (p.experience.length) { out.push(`<h2>Work Experience</h2>`); p.experience.forEach(e => { out.push(`<div class="item"><strong>${esc(e.role)} – ${esc(e.company)}</strong><em>${esc(e.period)}</em><ul>`); if (e.description) out.push(`<li>${esc(e.description).replace(/\n/g, '</li><li>')}</li>`); out.push(`</ul></div>`); }); }
    if (p.education.length) { out.push(`<h2>Education</h2>`); p.education.forEach(e => { out.push(`<div class="item"><strong>${esc(e.degree)}</strong><em>${esc(e.school)} – ${esc(e.period)}</em></div>`); }); }
    const skills = p.skills.flatMap(g => g.items); if (skills.length) { out.push(`<h2>Skills</h2><ul>`); skills.forEach(s => out.push(`<li>${esc(s)}</li>`)); out.push(`</ul>`); }
    if (p.languages.length) { out.push(`<h2>Languages</h2><ul>`); p.languages.forEach(l => out.push(`<li>${esc(l.name)} – ${esc(l.level)}</li>`)); out.push(`</ul>`); }
    return out.join('') + `</body></html>`;
  }

  function buildNormalCV(p) {
    const d = p.personal, out = [];
    out.push(`<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:12px;line-height:1.4;color:#111;padding:30px}h1{font-size:20px;text-align:center;margin:0;letter-spacing:3px}.contact{text-align:center;font-size:11px;margin:6px 0 14px}h2{font-size:13px;background:#eee;padding:4px 6px;margin-top:14px}table{width:100%;border-collapse:collapse;margin-top:4px}td,th{border:1px solid #999;padding:4px 6px;font-size:11px;vertical-align:top}th{background:#f3f3f3;text-align:left}ul{margin:4px 0;padding-left:18px}</style></head><body>`);
    out.push(`<h1>CURRICULUM VITAE</h1><div class="contact"><strong>${esc(d.fullName)}</strong><br>Phone: ${esc(d.phone)} | Email: ${esc(d.email)}<br>`);
    const addr = []; if (d.address) addr.push(`Address: ${esc(d.address)}`); if (d.dob) addr.push(`DOB: ${esc(d.dob)}`); if (d.nationality) addr.push(`Nationality: ${esc(d.nationality)}`); out.push(addr.join(' | ') + `</div>`);
    if (p.education.length) { out.push(`<h2>1. EDUCATION BACKGROUND</h2><table><tr><th>Period</th><th>School</th><th>Certificate</th></tr>`); p.education.forEach(e => out.push(`<tr><td>${esc(e.period)}</td><td>${esc(e.school)}</td><td>${esc(e.degree)}</td></tr>`)); out.push(`</table>`); }
    if (p.experience.length) { out.push(`<h2>2. FIELD / WORK EXPERIENCE</h2><table><tr><th>Period</th><th>Place</th><th>Task Done</th></tr>`); p.experience.forEach(e => out.push(`<tr><td>${esc(e.period)}</td><td>${esc(e.company)}</td><td>${esc(e.description)}</td></tr>`)); out.push(`</table>`); }
    out.push(`<h2>3. SKILLS</h2><ul>`);
    if (p.skills.technical?.length) out.push(`<li><strong>Technical:</strong> ${p.skills.technical.map(esc).join(', ')}</li>`);
    if (p.skills.computer?.length) out.push(`<li><strong>Computer:</strong> ${p.skills.computer.map(esc).join(', ')}</li>`);
    if (p.languages.length) out.push(`<li><strong>Languages:</strong> ${p.languages.map(l => `${esc(l.name)} (${esc(l.level)})`).join(', ')}</li>`); out.push(`</ul>`);
    if (p.references.length) { out.push(`<h2>4. REFERENCES</h2>`); p.references.forEach((r,i) => out.push(`<p>${i+1}. ${esc(r.name)} – ${esc(r.role)} – ${esc(r.phone)}</p>`)); }
    return out.join('') + `</body></html>`;
  }

  function buildLetter(p, kind, jobTitle, company) {
    const d = p.personal;
    const body = kind === 'application' ? `Dear Sir/Madam,\n\nI am writing to formally apply for the position of ${jobTitle} at ${company}.\n\nI hold a ${p.education[0]?.degree || 'degree'} from ${p.education[0]?.school || 'my institution'}. My skills include ${p.skills.technical?.slice(0,3).join(', ')}.\n\nI would be grateful for the opportunity to contribute to ${company}.\n\nYours faithfully,\n${d.fullName}` : `Dear Hiring Manager,\n\nI am excited to apply for the ${jobTitle} position at ${company}.\n\nWith my background in ${p.education[0]?.degree || 'my field'} and hands-on skills in ${p.skills.technical?.slice(0,3).join(', ')}, I am confident I can contribute meaningfully to your team.\n\nThank you for your time.\n\nSincerely,\n${d.fullName}`;
    return `<html><head><meta charset="utf-8"><style>body{font-family:Georgia,serif;font-size:12px;line-height:1.6;padding:40px;color:#222;max-width:800px;margin:0 auto}.head{margin-bottom:20px}.head strong{font-size:14px}pre{white-space:pre-wrap;font-family:inherit;margin:0}</style></head><body><div class="head"><strong>${esc(d.fullName)}</strong><br>${esc(d.phone)} | ${esc(d.email)}</div><pre>${esc(body)}</pre></body></html>`;
  }

  function buildLetterFromTemplate(templateText) {
    return `<html><head><meta charset="utf-8"><style>body{font-family:Georgia,serif;font-size:12px;line-height:1.6;padding:40px;color:#222;max-width:800px;margin:0 auto}pre{white-space:pre-wrap;font-family:inherit;margin:0}</style></head><body><pre>${esc(templateText)}</pre></body></html>`;
  }

  loadStoredPortfolio();
})();