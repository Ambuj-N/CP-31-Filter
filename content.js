(function() {
    'use strict';

    // 0. Safety Check
    const path = window.location.pathname;
    const isProblemsetList = (path === '/problemset' || path === '/problemset/' || path.includes('/problemset/page/'));
    if (!isProblemsetList) return;

    // --- Configuration ---
    const RATING_COLORS = {
        "800": "#808080", "900": "#808080", "1000": "#808080", "1100": "#808080",
        "1200": "#008000", "1300": "#008000",
        "1400": "#03A89E", "1500": "#03A89E",
        "1600": "#0000FF", "1700": "#0000FF", "1800": "#0000FF",
        "1900": "#AA00AA"
    };

    // 1. Inject Control Panel
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const panel = document.createElement('div');
    panel.className = 'roundbox sidebox cp31-panel';
    
    panel.innerHTML = `
        <div class="caption titled cp31-header">
            <span class="cp31-title-text">→ CP-31 Master</span>
            <div class="cp31-badges">
                <div id="streak-badge" class="streak-badge" title="Consecutive days streak">
                    🔥 <span id="streak-count">0</span>
                </div>
                <div id="daily-badge" class="daily-badge" title="Click to set Daily Goal">
                    Today: <span id="today-count">0</span>
                </div>
            </div>
        </div>

        <div class="cp31-inner">
            <div class="cp31-row">
                <label class="cp31-checkbox-label">
                    <input type="checkbox" id="cp31-toggle"> Enable CP-31
                </label>
            </div>
            
            <div id="cp31-controls" style="display: none;">
                
                <div id="cp31-progress-section" class="cp31-progress-section" style="display:none;">
                    <div class="cp31-info-text">
                        <span id="cp31-progress-text">Progress: 0/31</span>
                        <span id="cp31-progress-percent">0%</span>
                    </div>
                    <div class="cp31-progress-container">
                        <div id="cp31-progress-bar" class="cp31-progress-fill" style="width:0%"></div>
                    </div>
                </div>

                <div class="cp31-row" style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #eee;">
                     <label class="cp31-checkbox-label">
                        <input type="checkbox" id="cp31-hide-tags"> Hide Tags
                    </label>
                </div>

                <div class="cp31-row">
                    <select id="cp31-rating" class="cp31-select" style="font-weight:bold;"></select>
                </div>
                
                <div class="cp31-row">
                    <select id="cp31-status-filter" class="cp31-select">
                        <option value="all">Show: All</option>
                        <option value="solved">Show: Solved</option>
                        <option value="unsolved">Show: Unsolved</option>
                    </select>
                </div>

                <div class="cp31-row">
                    <select id="cp31-tag-filter" class="cp31-select">
                        <option value="">Filter by Tag (Include)...</option>
                    </select>
                    <div id="cp31-chip-container" class="cp31-chip-container"></div>
                </div>

                <div class="cp31-row">
                    <select id="cp31-exclude-filter" class="cp31-select">
                        <option value="">Exclude Tag...</option>
                    </select>
                    <div id="cp31-exclude-chip-container" class="cp31-chip-container"></div>
                </div>

                <button id="cp31-random-btn" class="cp31-btn cp31-btn-random">
                    Pick Random
                </button>

                <div id="cp31-msg" style="font-size:11px; color:#666; margin-top: 5px; min-height:15px;"></div>
            </div>
        </div>
    `;
    sidebar.insertBefore(panel, sidebar.firstChild);

    // 2. DOM Elements
    const toggle = document.getElementById('cp31-toggle');
    const hideTagsToggle = document.getElementById('cp31-hide-tags');
    const controls = document.getElementById('cp31-controls');
    const rndBtn = document.getElementById('cp31-random-btn');
    const msgDiv = document.getElementById('cp31-msg');
    const ratingSelect = document.getElementById('cp31-rating');
    const statusFilter = document.getElementById('cp31-status-filter');
    
    // Tag Elements
    const tagFilterSelect = document.getElementById('cp31-tag-filter');
    const chipContainer = document.getElementById('cp31-chip-container');
    const excludeFilterSelect = document.getElementById('cp31-exclude-filter');
    const excludeChipContainer = document.getElementById('cp31-exclude-chip-container');
    
    const progressSection = document.getElementById('cp31-progress-section');
    const progressText = document.getElementById('cp31-progress-text');
    const progressPercent = document.getElementById('cp31-progress-percent');
    const progressBar = document.getElementById('cp31-progress-bar');
    
    const todayCountSpan = document.getElementById('today-count');
    const dailyBadge = document.getElementById('daily-badge');
    const streakBadge = document.getElementById('streak-badge');
    const streakCountSpan = document.getElementById('streak-count');
    
    let originalTableHTML = "";
    const tableElement = document.querySelector('table.problems');
    let GLOBAL_USER_SOLVED = new Set();
    let USER_HANDLE = null;
    let cachedProblems = null;
    
    // Active Filters
    let ACTIVE_TAG_FILTERS = new Set();
    let EXCLUDED_TAG_FILTERS = new Set();

    // 3. Initialize
    function init() {
        const ratings = Object.keys(CP31_DATABASE).sort((a,b) => parseInt(a) - parseInt(b));
        ratingSelect.innerHTML = "";
        ratings.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            opt.style.color = RATING_COLORS[r];
            ratingSelect.appendChild(opt);
        });

        const saved = JSON.parse(localStorage.getItem('cp31_settings')) || {};
        if (saved.enabled) toggle.checked = true;
        if (saved.hideTags) hideTagsToggle.checked = true;
        if (saved.rating) ratingSelect.value = saved.rating;
        if (saved.filter) statusFilter.value = saved.filter;

        applyTagVisibility();

        if (toggle.checked) {
            controls.style.display = 'block';
            if(tableElement && !originalTableHTML) originalTableHTML = tableElement.innerHTML;
            updateUI();
            fetchUserProgress(true); 
        }
    }

    function saveSettings() {
        localStorage.setItem('cp31_settings', JSON.stringify({
            enabled: toggle.checked,
            hideTags: hideTagsToggle.checked,
            rating: ratingSelect.value,
            filter: statusFilter.value
        }));
    }

    function updateUI() {
        ratingSelect.style.color = RATING_COLORS[ratingSelect.value] || "black";
        rndBtn.textContent = `Pick Random ${ratingSelect.value}`;
        updateProgressBarUI(ratingSelect.value);
    }

    function applyTagVisibility() {
        if (!tableElement) return;
        if (hideTagsToggle.checked && toggle.checked) {
            tableElement.classList.add('cp31-hidden-tags');
        } else {
            tableElement.classList.remove('cp31-hidden-tags');
        }
    }

    // Event Listeners
    [ratingSelect, statusFilter].forEach(el => {
        el.addEventListener('change', () => {
            if (el === ratingSelect) {
                // Clear tags when rating changes to avoid confusion
                ACTIVE_TAG_FILTERS.clear();
                EXCLUDED_TAG_FILTERS.clear();
                renderTagChips();
            }
            saveSettings();
            updateUI();
            loadList(); 
        });
    });

    hideTagsToggle.addEventListener('change', () => {
        saveSettings();
        applyTagVisibility();
    });

    toggle.addEventListener('change', () => {
        saveSettings();
        if (toggle.checked) {
            controls.style.display = 'block';
            if(tableElement && !originalTableHTML) originalTableHTML = tableElement.innerHTML;
            fetchUserProgress(true);
        } else {
            controls.style.display = 'none';
            if(originalTableHTML) {
                tableElement.innerHTML = originalTableHTML;
                tableElement.classList.remove('cp31-hidden-tags');
                msgDiv.textContent = "";
            }
        }
    });

    // --- INCLUDE Tag Filter Logic ---
    tagFilterSelect.addEventListener('change', () => {
        const val = tagFilterSelect.value;
        if (val === 'SELECT_ALL') {
            Array.from(tagFilterSelect.options).forEach(opt => {
                if (opt.value && opt.value !== 'SELECT_ALL' && opt.value !== 'CLEAR_ALL') {
                    ACTIVE_TAG_FILTERS.add(opt.value);
                    // Ensure a tag isn't both included and excluded
                    EXCLUDED_TAG_FILTERS.delete(opt.value);
                }
            });
        } else if (val === 'CLEAR_ALL') {
            ACTIVE_TAG_FILTERS.clear();
        } else if (val) {
            ACTIVE_TAG_FILTERS.add(val);
            EXCLUDED_TAG_FILTERS.delete(val);
        }
        renderTagChips();
        tagFilterSelect.value = "";
        loadList(); 
    });

    // --- EXCLUDE Tag Filter Logic ---
    excludeFilterSelect.addEventListener('change', () => {
        const val = excludeFilterSelect.value;
        if (val) {
            EXCLUDED_TAG_FILTERS.add(val);
            ACTIVE_TAG_FILTERS.delete(val); // Cannot include and exclude same tag
            renderTagChips();
            excludeFilterSelect.value = "";
            loadList();
        }
    });

    function renderTagChips() {
        // Render Include Chips
        chipContainer.innerHTML = "";
        ACTIVE_TAG_FILTERS.forEach(tag => {
            const chip = document.createElement('div');
            chip.className = 'cp31-chip';
            chip.innerHTML = `${tag} <span class="cp31-chip-close">×</span>`;
            chip.addEventListener('click', () => {
                ACTIVE_TAG_FILTERS.delete(tag);
                renderTagChips();
                loadList();
            });
            chipContainer.appendChild(chip);
        });

        // Render Exclude Chips
        excludeChipContainer.innerHTML = "";
        EXCLUDED_TAG_FILTERS.forEach(tag => {
            const chip = document.createElement('div');
            chip.className = 'cp31-chip excluded'; // Red style
            chip.innerHTML = `${tag} <span class="cp31-chip-close">×</span>`;
            chip.addEventListener('click', () => {
                EXCLUDED_TAG_FILTERS.delete(tag);
                renderTagChips();
                loadList();
            });
            excludeChipContainer.appendChild(chip);
        });
    }

    dailyBadge.addEventListener('click', () => {
        const currentGoal = localStorage.getItem('cp31_daily_goal') || 0;
        const newGoal = prompt("Set your daily solve goal (number):", currentGoal);
        if (newGoal !== null && !isNaN(newGoal)) {
            localStorage.setItem('cp31_daily_goal', parseInt(newGoal));
            fetchUserProgress(false); 
        }
    });

    // 4. Data Logic
    async function fetchUserProgress(autoLoadTable = false) {
        const handleLink = document.querySelector('a[href^="/profile/"]');
        USER_HANDLE = handleLink ? handleLink.innerText.trim() : null;

        if (!USER_HANDLE) {
            msgDiv.textContent = "Log in for progress.";
            if(autoLoadTable) loadList(); 
            return;
        }

        try {
            msgDiv.textContent = "Syncing...";
            const response = await fetch(`https://codeforces.com/api/user.status?handle=${USER_HANDLE}`);
            const data = await response.json();
            
            if (data.status === "OK") {
                const submissions = data.result;
                
                GLOBAL_USER_SOLVED.clear();
                submissions.forEach(sub => {
                    if (sub.verdict === "OK") GLOBAL_USER_SOLVED.add(sub.problem.contestId + sub.problem.index);
                });

                updateAdvancedStats(submissions);
                updateDropdownCounts();
                msgDiv.textContent = "";
                progressSection.style.display = "block";
                updateUI();
                
                if(autoLoadTable) loadList();
            }
        } catch (e) { 
            console.error(e); 
            if(autoLoadTable) loadList();
        }
    }

    // --- Advanced Stats ---
    function updateAdvancedStats(submissions) {
        const allCp31Ids = new Set();
        Object.values(CP31_DATABASE).forEach(list => list.forEach(idStr => allCp31Ids.add(idStr.replace(':', ''))));

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfDaySeconds = today.getTime() / 1000;
        
        const solvedTodayIds = new Set();
        submissions.forEach(sub => {
            if (sub.verdict === "OK" && sub.creationTimeSeconds >= startOfDaySeconds) {
                const id = sub.problem.contestId + sub.problem.index;
                if (allCp31Ids.has(id)) solvedTodayIds.add(id);
            }
        });
        const todayCount = solvedTodayIds.size;

        const goal = parseInt(localStorage.getItem('cp31_daily_goal')) || 0;
        if (goal > 0) {
            todayCountSpan.textContent = `${todayCount} / ${goal}`;
            if (todayCount >= goal) {
                dailyBadge.className = 'daily-badge gold';
                dailyBadge.title = "Goal Reached! Click to edit.";
            } else {
                dailyBadge.className = 'daily-badge active';
            }
        } else {
            todayCountSpan.textContent = todayCount;
            dailyBadge.className = todayCount > 0 ? 'daily-badge active' : 'daily-badge';
        }

        let currentStreak = 0;
        let dateCheck = new Date();
        dateCheck.setHours(0,0,0,0);
        
        const solvedOnDate = (dateObj) => {
            const start = dateObj.getTime() / 1000;
            const end = start + 86400;
            return submissions.some(sub => {
                const id = sub.problem.contestId + sub.problem.index;
                return sub.verdict === "OK" && 
                       allCp31Ids.has(id) && 
                       sub.creationTimeSeconds >= start && 
                       sub.creationTimeSeconds < end;
            });
        };

        if (solvedOnDate(dateCheck)) {
            currentStreak++;
        }
        
        while (true) {
            dateCheck.setDate(dateCheck.getDate() - 1);
            if (solvedOnDate(dateCheck)) {
                currentStreak++;
            } else {
                break;
            }
        }

        streakCountSpan.textContent = currentStreak;
        if (currentStreak > 0) {
            streakBadge.style.display = 'block';
        } else {
            streakBadge.style.display = 'none';
        }
    }

    function updateDropdownCounts() {
        const currentVal = ratingSelect.value;
        Array.from(ratingSelect.options).forEach(opt => {
            const r = opt.value;
            if (CP31_DATABASE[r]) {
                const total = CP31_DATABASE[r].length;
                let solved = 0;
                CP31_DATABASE[r].forEach(pStr => {
                    const parts = pStr.split(':');
                    if(parts.length===2 && GLOBAL_USER_SOLVED.has(parts[0]+parts[1])) solved++;
                });
                opt.textContent = `${r} (${solved}/${total})`;
            }
        });
        ratingSelect.value = currentVal;
    }

    function updateProgressBarUI(rating) {
        if (!CP31_DATABASE[rating]) return;
        const total = CP31_DATABASE[rating].length;
        let solved = 0;
        CP31_DATABASE[rating].forEach(pStr => {
            const parts = pStr.split(':');
            if(parts.length===2 && GLOBAL_USER_SOLVED.has(parts[0]+parts[1])) solved++;
        });
        const pct = Math.round((solved / total) * 100);
        progressText.textContent = `Progress: ${solved}/${total}`;
        progressPercent.textContent = `${pct}%`;
        progressBar.style.width = `${pct}%`;
    }

    // 5. Load List
    async function loadList() {
        const rating = ratingSelect.value;
        const filterType = statusFilter.value;
        const targetIds = CP31_DATABASE[rating];

        msgDiv.textContent = "Updating...";

        try {
            if (!cachedProblems) {
                const response = await fetch('https://codeforces.com/api/problemset.problems?lang=en');
                const data = await response.json();
                if (data.status === "OK") {
                    cachedProblems = {
                        problems: data.result.problems,
                        stats: data.result.problemStatistics
                    };
                } else {
                    throw new Error("API Error");
                }
            }

            const allProblems = cachedProblems.problems;
            const allStats = cachedProblems.stats;
            
            // 1. First Pass: Get Candidates (Rating + Status)
            let candidates = [];
            targetIds.forEach(targetString => {
                const parts = targetString.split(':');
                if (parts.length !== 2) return;
                const fullId = parts[0] + parts[1];

                const problem = allProblems.find(p => p.contestId == parts[0] && p.index == parts[1]);
                const stat = allStats.find(s => s.contestId == parts[0] && s.index == parts[1]);
                
                if (problem) {
                    const isSolved = GLOBAL_USER_SOLVED.has(fullId);
                    let statusMatch = true;
                    if (filterType === 'solved' && !isSolved) statusMatch = false;
                    if (filterType === 'unsolved' && isSolved) statusMatch = false;

                    if (statusMatch) {
                        candidates.push({ 
                            ...problem, 
                            solvedCount: stat ? stat.solvedCount : 0, 
                            isSolved: isSolved 
                        });
                    }
                }
            });

            // 2. Filter by Active Tags (OR Logic) AND Exclude Tags (NOT Logic)
            let finalDisplayList = candidates.filter(p => {
                const pTags = new Set(p.tags);

                // A. Exclude Logic (Priority): If problem matches ANY excluded tag, hide it.
                if (EXCLUDED_TAG_FILTERS.size > 0) {
                    for (let exTag of EXCLUDED_TAG_FILTERS) {
                        if (pTags.has(exTag)) return false; // Problem banned
                    }
                }

                // B. Include Logic (OR): If filters exist, problem must match AT LEAST ONE.
                if (ACTIVE_TAG_FILTERS.size > 0) {
                    let matchFound = false;
                    for (let incTag of ACTIVE_TAG_FILTERS) {
                        if (pTags.has(incTag)) {
                            matchFound = true;
                            break;
                        }
                    }
                    if (!matchFound) return false;
                }

                return true;
            });

            // 3. Collect Tags for Dropdowns (from Candidates)
            const dynamicTags = new Set();
            candidates.forEach(p => {
                if (p.tags && Array.isArray(p.tags)) {
                    p.tags.forEach(t => dynamicTags.add(t));
                }
            });

            // 4. Update Include Dropdown
            tagFilterSelect.innerHTML = "";
            const defaultOpt = document.createElement('option');
            defaultOpt.value = "";
            defaultOpt.textContent = "Filter by Tag (Include)...";
            tagFilterSelect.appendChild(defaultOpt);

            const selectAllOpt = document.createElement('option');
            selectAllOpt.value = "SELECT_ALL";
            selectAllOpt.textContent = "Select All Tags";
            selectAllOpt.style.fontWeight = "bold";
            tagFilterSelect.appendChild(selectAllOpt);

            if (ACTIVE_TAG_FILTERS.size > 0) {
                const clearOpt = document.createElement('option');
                clearOpt.value = "CLEAR_ALL";
                clearOpt.textContent = "Clear Include Filters";
                clearOpt.style.color = "#cc0000";
                tagFilterSelect.appendChild(clearOpt);
            }

            Array.from(dynamicTags).sort().forEach(tag => {
                if (!ACTIVE_TAG_FILTERS.has(tag) && !EXCLUDED_TAG_FILTERS.has(tag)) {
                    const opt = document.createElement('option');
                    opt.value = tag;
                    opt.textContent = tag;
                    tagFilterSelect.appendChild(opt);
                }
            });

            // 5. Update Exclude Dropdown
            excludeFilterSelect.innerHTML = "";
            const defaultExOpt = document.createElement('option');
            defaultExOpt.value = "";
            defaultExOpt.textContent = "Exclude Tag...";
            excludeFilterSelect.appendChild(defaultExOpt);

            Array.from(dynamicTags).sort().forEach(tag => {
                // Only show tags not already excluded AND not currently included
                if (!EXCLUDED_TAG_FILTERS.has(tag) && !ACTIVE_TAG_FILTERS.has(tag)) {
                    const opt = document.createElement('option');
                    opt.value = tag;
                    opt.textContent = tag;
                    excludeFilterSelect.appendChild(opt);
                }
            });

            renderTable(finalDisplayList, rating);
            msgDiv.textContent = `Showing ${finalDisplayList.length} problems.`;

        } catch (err) {
            console.error(err);
            msgDiv.textContent = "API Error.";
        }
    }

    // 6. Random Action
    rndBtn.addEventListener('click', () => {
        const rows = tableElement.querySelectorAll('tbody tr');
        if (rows.length === 0 || rows[0].innerText.includes("No problems")) {
            msgDiv.textContent = "No problems to pick from!";
            return;
        }

        const validLinks = [];
        rows.forEach(row => {
            const linkEl = row.querySelector('td.left a');
            if (linkEl) validLinks.push(linkEl.getAttribute('href'));
        });

        if (validLinks.length === 0) {
            msgDiv.textContent = "No problems found!";
            return;
        }

        const randomLink = validLinks[Math.floor(Math.random() * validLinks.length)];
        msgDiv.textContent = `Opening...`;
        window.open(`https://codeforces.com${randomLink}`, '_blank');
    });

    function renderTable(problems, rating) {
        if (!tableElement) return;
        applyTagVisibility();

        let html = `
            <tbody>
                <tr>
                    <th class="top left" style="width: 10%;">#</th>
                    <th class="top" style="width: 60%;">Name</th>
                    <th class="top" style="width: 15%;">Rating</th>
                    <th class="top right" style="width: 15%;">Solved</th>
                </tr>
        `;
        problems.forEach(p => {
            const link = `/problemset/problem/${p.contestId}/${p.index}`;
            const rowColor = p.isSolved ? '#e6ffed' : '#f8f9fa';
            html += `
                <tr style="background-color: ${rowColor};">
                    <td class="left"><a href="${link}">${p.contestId}${p.index}</a></td>
                    <td>
                        <div style="float: left;">
                            <a href="${link}">${p.name}</a>
                        </div>
                        <div style="clear: both;"></div>
                        <div class="cp31-tag-area">
                            ${p.tags.join(', ')}
                        </div>
                    </td>
                    <td><span class="ProblemRating" style="color:${RATING_COLORS[rating]}">${p.rating || rating}</span></td>
                    <td class="right">x${p.solvedCount}</td>
                </tr>
            `;
        });
        if (problems.length === 0) html += `<tr><td colspan="4" style="text-align:center; padding:15px;">No problems found.</td></tr>`;
        html += `</tbody>`;
        tableElement.innerHTML = html;
    }

    setTimeout(init, 100);
})();
