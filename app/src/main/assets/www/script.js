// @ts-nocheck
(() => {
  // ⚠️ REPLACE THIS WITH YOUR ACTUAL CLOUDFLARE WORKER URL ⚠️
  const WORKER_URL = "https://cv-gen-ai.justinwc8.workers.dev/"; 

  const $ = id => document.getElementById(id);
  let portfolio = null;
  let currentAiHtml = null;
  let retryCount = 0;

  const show = id => { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0,0); };

  // ---------- THEME ----------
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

  // ---------- COPY FUNCTIONS ----------
  window.copyText = function(type) { alert("Loading payment info, please try again."); };

  // ---------- STORAGE ----------
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
  }

  // ---------- GENERATE ----------
  $('doc-type').addEventListener('change', e => {
    const type = e.target.value;
    // Show extra fields for BOTH Professional and Normal CV
    $('extra-fields').style.display = (type === 'normal_cv' || type === 'professional_cv') ? 'block' : 'none';
  });

  $('btn-do-generate').addEventListener('click', async () => {
    if (!portfolio) return;
    
    const docType = $('doc-type').value;
    const jobTitle = $('job-title').value || 'the position';
    const company = $('company').value || 'your organization';
    const useAI = $('use-ai').checked;
    const jobAdText = $('job-ad').value || '';

    if (!useAI && uploadedFileData) return alert("You uploaded a file. Pro AI is required to read it.");

    // Gather the extra typed details
    const extraData = {
      idNumber: $('extra-id').value,
      dob: $('extra-dob').value,
      placeOfBirth: $('extra-place-of-birth').value,
      nationality: $('extra-nationality').value,
      maritalStatus: $('extra-marital-status').value
    };

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
      let html = '';
      if (docType === 'professional_cv') html = buildProfessionalCV(portfolio, extraData);
      else if (docType === 'normal_cv') html = buildNormalCV(portfolio, extraData);
      else if (docType === 'cover_letter') html = buildSmartLetter(portfolio, 'cover', jobTitle, company);
      else if (docType === 'application_letter') html = buildSmartLetter(portfolio, 'application', jobTitle, company);
      
      $('preview-frame').srcdoc = html; show('screen-preview');
    }
  });

  // ---------- POLLING ----------
  function checkPendingJob() {
    const pending = localStorage.getItem('pending_ai_job');
    if (pending) {
      const job = JSON.parse(pending);
      startBannerPolling(job.payload);
    }
  }

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

  // ---------- AI AUTH & DYNAMIC PAYMENT FETCH ----------
  $('pay-method').addEventListener('change', (e) => {
    if (e.target.value === 'binance') $('binance-input-group').style.display = 'block';
    else $('binance-input-group').style.display = 'none';
  });

  $('use-ai').addEventListener('change', async (e) => {
    if (e.target.checked) {
      $('ai-auth-box').style.display = 'block';
      $('btn-verify').style.display = 'block';
      $('payment-info').style.display = 'none'; 
      
      try {
        const configRes = await fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_payment_info" }) });
        const config = await configRes.json();
        
        $('text-merchant-code').textContent = config.merchant;
        $('text-mtn-num').textContent = config.mtn;
        $('text-airtel-num').textContent = config.airtel;
        $('pay-name').textContent = config.name;
        $('binance-id').textContent = config.binance;

        window.copyText = function(type) {
          let textToCopy = "";
          if (type === 'merchant') textToCopy = config.merchant;
          else if (type === 'mtn') textToCopy = config.mtn;
          else if (type === 'airtel') textToCopy = config.airtel;
          else if (type === 'binance') textToCopy = config.binance;

          if (textToCopy) {
            navigator.clipboard.writeText(textToCopy)
              .then(() => alert("✅ Copied: " + textToCopy))
              .catch(() => alert("Failed to copy. Please write it down: " + textToCopy));
          }
        };
      } catch (err) {
        console.error("Failed to load payment config", err);
        $('text-merchant-code').textContent = "Offline - check network";
      }
      
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
            $('btn-verify').style.display = 'none';
          } else if (data.status === "revoked") {
            $('auth-status').textContent = "⚠️ Credits used up. Please renew below.";
            $('auth-status').style.color = "#ef4444";
            $('btn-verify').textContent = "Renew Access";
          } else {
            $('auth-status').textContent = "❌ Not active. Please request access.";
            $('auth-status').style.color = "#ef4444";
            $('btn-verify').textContent = "Request Access";
          }
        } catch (err) { $('auth-status').textContent = "❌ Network error."; $('auth-status').style.color = "#ef4444"; }
      } else {
        $('pin-setup-group').style.display = 'block'; $('pin-verify-group').style.display = 'none';
        $('auth-status').textContent = "First time setup: Create a PIN and request access.";
        $('auth-status').style.color = "#8b5cf6";
      }
    } else { 
      $('ai-auth-box').style.display = 'none'; 
    }
  });

  $('btn-verify').addEventListener('click', async () => {
    const phone = $('pro-phone').value, pin = $('pro-pin-setup').value || $('pro-pin-verify').value;
    const payMethod = $('pay-method').value;
    const userBinanceId = $('user-binance-id').value || "Not provided";
    
    if (!phone) return alert("Enter phone number.");
    if (payMethod === 'binance' && userBinanceId === "Not provided") return alert("Please enter your Binance Email/ID.");
    
    $('auth-status').textContent = "⏳ Requesting..."; $('btn-verify').disabled = true;
    
    try {
      const res = await fetch(WORKER_URL, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ action: "request_access", phone, pin, payMethod, userBinanceId }) 
      });
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem('pro_phone', phone); 
        if ($('pro-pin-setup').value) localStorage.setItem('pro_pin', $('pro-pin-setup').value);
        
        $('auth-status').textContent = "✅ Request sent!"; 
        $('auth-status').style.color = "#10b981";
        
        $('payment-info').style.display = 'block';
        $('pay-rwanda').style.display = payMethod === 'rwanda' ? 'block' : 'none';
        $('pay-binance').style.display = payMethod === 'binance' ? 'block' : 'none';
        
        $('btn-verify').textContent = "Request Sent";
        $('btn-verify').style.display = 'none';
      } else { 
        $('auth-status').textContent = "❌ " + data.error; $('auth-status').style.color = "#ef4444"; 
        $('btn-verify').disabled = false;
      }
    } catch (e) { 
    // Show the REAL error message
        $('auth-status').textContent = "❌ " + e.message; 
        $('auth-status').style.color = "#ef4444"; 
        $('btn-verify').disabled = false;
} 
  });

  // 🧠 DYNAMIC OFFLINE AI (Matches Handwritten Notes)
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function getTopSkills(p, count) {
    const allSkills = p.skills.flatMap(g => g.items);
    if (allSkills.length === 0) return "various professional skills";
    return allSkills.slice(0, count).join(", ");
  }

  function generateSmartSummary(p) {
    const firstName = p.personal.fullName.split(' ')[0] || 'The candidate';
    const degree = p.education[0]?.degree || "a strong academic background";
    const school = p.education[0]?.school || "a recognized institution";
    const skills = getTopSkills(p, 3);
    
    let expText = "";
    if (p.experience && p.experience.length > 0) {
      expText = ` With practical experience as a ${p.experience[0].role},`;
    }

    return `${firstName} is a dedicated professional with ${degree} from ${school}.${expText} possessing strong expertise in ${skills}, ${firstName} is committed to delivering high-quality results and contributing effectively to a dynamic team.`;
  }

  // UPDATED: Professional CV with Photo and ID details
  function buildProfessionalCV(p, extra) {
    const d = p.personal;
    const summary = p.about || generateSmartSummary(p);
    const allSkills = p.skills.flatMap(g => g.items);

    let html = `<html><head><meta charset="utf-8"><style>
      body{font-family:Georgia,serif;font-size:13px;line-height:1.6;color:#222;padding:40px;max-width:800px;margin:0 auto}
      .header{text-align:center; margin-bottom: 30px; border-bottom: 1px solid #ccc; padding-bottom: 15px;}
      .photo{width:110px; height:110px; border-radius:50%; object-fit:cover; margin-bottom:15px; border: 2px solid #333;}
      h1{font-size:26px;margin:0 0 4px;letter-spacing:1px;color:#111}
      .contact{font-size:12px;color:#555;}
      .id-details{font-size:12px; color:#555; margin-top:5px;}
      h2{font-size:14px;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:4px;margin-top:25px;letter-spacing:1px}
      .item{margin-bottom:15px}
      .item strong{font-size:14px;display:block;color:#000}
      .item em{color:#666;font-size:12px;display:block;margin-bottom:5px}
      ul{margin:5px 0;padding-left:20px}
      li{margin-bottom:4px}
      p{margin:5px 0}
    </style></head><body>`;
    
    html += `<div class="header">`;
    if (d.photo) html += `<img src="${d.photo}" class="photo" alt="Profile Photo">`;
    html += `<h1>${esc(d.fullName)}</h1>`;
    html += `<div class="contact">${esc(d.phone)} | ${esc(d.email)} | ${esc(d.location)}</div>`;
    
    // Add the extra typed details
    const idInfo = [];
    if (extra.idNumber) idInfo.push(`ID: ${esc(extra.idNumber)}`);
    if (extra.dob) idInfo.push(`DOB: ${esc(extra.dob)}`);
    if (extra.nationality) idInfo.push(`Nationality: ${esc(extra.nationality)}`);
    if (extra.maritalStatus) idInfo.push(`Marital Status: ${esc(extra.maritalStatus)}`);
    
    if (idInfo.length > 0) {
      html += `<div class="id-details">${idInfo.join(' | ')}</div>`;
    }
    
    html += `</div>`;
    
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

  // UPDATED: Normal CV matching Image 2 and using typed ExtraData
  function buildNormalCV(p, extra) {
    const d = p.personal;
    let html = `<html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#111;padding:30px;max-width:800px;margin:0 auto}
      h1{font-size:22px;text-align:center;margin:0 0 20px;letter-spacing:2px;text-decoration:underline}
      h2{font-size:14px;margin-top:25px;margin-bottom:10px;text-decoration:underline}
      table{width:100%;border-collapse:collapse;margin-bottom:15px}
      td,th{padding:6px;font-size:12px;vertical-align:top;border: 1px solid #333;}
      th{background:#f0f0f0;text-align:left;font-weight:bold;}
      .info-table td:first-child { width: 30%; font-weight: bold; }
      .declaration{margin-top:40px;font-size:12px;font-style:italic}
    </style></head><body>`;
    
    html += `<h1>CURRICULUM VITAE</h1>`;
    
    // 1. IDENTIFICATION (Uses ExtraData)
    html += `<h2>1. IDENTIFICATION</h2>`;
    html += `<table class="info-table">`;
    html += `<tr><td>Name:</td><td>${esc(d.fullName)}</td></tr>`;
    if (extra.idNumber) html += `<tr><td>ID Number:</td><td>${esc(extra.idNumber)}</td></tr>`;
    html += `<tr><td>Date of birth:</td><td>${esc(extra.dob)}</td></tr>`;
    html += `<tr><td>Place of birth:</td><td>${esc(extra.placeOfBirth)}</td></tr>`;
    html += `<tr><td>Nationality:</td><td>${esc(extra.nationality)}</td></tr>`;
    html += `<tr><td>Marital status:</td><td>${esc(extra.maritalStatus)}</td></tr>`;
    html += `<tr><td>Phone:</td><td>${esc(d.phone)}</td></tr>`;
    html += `<tr><td>Email:</td><td>${esc(d.email)}</td></tr>`;
    html += `<tr><td>Address:</td><td>${esc(d.location)}</td></tr>`;
    html += `</table>`;

    // 2. EDUCATION
    if (p.education.length) {
      html += `<h2>2. EDUCATION</h2>`;
      html += `<table><tr><th style="width:20%">Year</th><th style="width:40%">School</th><th style="width:40%">Award/Certificate</th></tr>`;
      p.education.forEach(e => html += `<tr><td>${esc(e.period)}</td><td>${esc(e.school)}</td><td>${esc(e.degree)}</td></tr>`);
      html += `</table>`;
    }

    // 3. WORK EXPERIENCE
    if (p.experience.length) {
      html += `<h2>3. WORK EXPERIENCE</h2>`;
      html += `<table><tr><th style="width:20%">Year</th><th style="width:40%">Place/Institution</th><th style="width:40%">Position/Job</th></tr>`;
      p.experience.forEach(e => html += `<tr><td>${esc(e.period)}</td><td>${esc(e.company)}</td><td>${esc(e.role)}</td></tr>`);
      html += `</table>`;
    }

    // SKILLS
    if (p.skills.length) {
      html += `<h2>4. SKILLS</h2><ul>`;
      p.skills.forEach(g => {
        if (g.items.length) html += `<li><strong>${esc(g.category)}:</strong> ${g.items.map(esc).join(', ')}</li>`;
      });
      if (p.languages.length) html += `<li><strong>Languages:</strong> ${p.languages.map(l => `${esc(l.name)} (${esc(l.level)})`).join(', ')}</li>`;
      html += `</ul>`;
    }

    if (p.references.length) {
      html += `<h2>5. REFERENCES</h2><ul>`;
      p.references.forEach((r) => html += `<li>${esc(r.name)} – ${esc(r.role)}, ${esc(r.organization)} (${esc(r.phone)})</li>`);
      html += `</ul>`;
    }

    html += `<div class="declaration"><p>I declare that the information provided above is true and correct to the best of my knowledge.</p></div>`;
    html += `</body></html>`;
    return html;
  }

  // Letter matching Image 1
  function buildSmartLetter(p, kind, jobTitle, company) {
    const d = p.personal;
    const degree = p.education[0]?.degree || "my academic background";
    const school = p.education[0]?.school || "my institution";
    const today = new Date().toLocaleDateString('en-GB');
    
    const topSkills = p.skills.flatMap(g => g.items).slice(0, 3);
    const skillString = topSkills.length > 1 ? topSkills.slice(0, -1).join(", ") + " and " + topSkills[topSkills.length - 1] : topSkills[0] || "relevant professional skills";

    let headerBlock = `
Name: ${d.fullName}
Email: ${d.email}
Phone: ${d.phone}
Location: ${d.location}
Date: ${today}
`;

    let subject = `\nRE: ${kind === 'application' ? 'APPLICATION' : 'COVER LETTER'} FOR THE POSITION OF ${jobTitle.toUpperCase()}\n`;

    let salutation = kind === 'application' ? "Dear Sir/Madam," : "Dear Hiring Manager,";

    let expParagraph = "";
    if (p.experience && p.experience.length > 0) {
      const lastJob = p.experience[0];
      expParagraph = ` In my previous role as a ${lastJob.role} at ${lastJob.company}, I gained valuable hands-on experience that strengthened my ability to deliver results.`;
    } else if (p.projects && p.projects.length > 0) {
      const topProject = p.projects[0];
      expParagraph = ` I have also successfully executed practical projects, such as ${topProject.title}, which allowed me to apply my skills in a real-world context.`;
    }

    let body = '';

    if (kind === 'application') {
      body = `${salutation}

I am writing to formally express my interest in the ${jobTitle} position at ${company}. 

Having completed my ${degree} at ${school}, I have developed a robust foundation in ${skillString}.${expParagraph} I am confident that my background and dedication to excellence align perfectly with the requirements of this role.

I have followed ${company}'s work with great interest and would be honored to contribute to your team. I am a highly motivated individual with a strong work ethic, eager to bring value to your esteemed organization.

Thank you for considering my application. I have attached my CV for your review and look forward to the opportunity to discuss my qualifications further.

Yours faithfully,

${d.fullName}`;
    } else {
      body = `${salutation}

I am writing to express my strong enthusiasm for the ${jobTitle} position at ${company}. 

As a professional with a ${degree} from ${school}, I have honed my expertise in ${skillString}.${expParagraph} What sets me apart is not just my technical ability, but my drive to deliver tangible results. I thrive in collaborative environments and take pride in approaching challenges with a problem-solving mindset.

I am particularly drawn to ${company} because of your innovative reputation in the industry. I am eager to bring my skills and proactive attitude to your team, and I am confident that my background will allow me to make a meaningful contribution to your upcoming projects.

Thank you for your time and consideration. I would welcome the opportunity to discuss how my qualifications align with the goals of your team.

Sincerely,

${d.fullName}`;
    }

    let fullText = `${headerBlock}${subject}\n${body}`;

    return `<html><head><meta charset="utf-8"><style>
      body{font-family:Georgia,serif;font-size:13px;line-height:1.8;padding:50px;color:#222;max-width:800px;margin:0 auto}
      pre{white-space:pre-wrap;font-family:inherit;margin:0}
    </style></head><body><pre>${esc(fullText)}</pre></body></html>`;
  }

  function buildLetterFromTemplate(templateText) {
    return `<html><head><meta charset="utf-8"><style>
      body{font-family:Georgia,serif;font-size:13px;line-height:1.8;padding:50px;color:#222;max-width:800px;margin:0 auto}
      pre{white-space:pre-wrap;font-family:inherit;margin:0}
    </style></head><body><pre>${esc(templateText)}</pre></body></html>`;
  }

  loadStoredPortfolio();
})();