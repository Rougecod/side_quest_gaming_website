/* ============================================
   QUEST GAMING CENTER — JAVASCRIPT
   Smooth Animations & Interactive Features
   ============================================ */

// ---- Auth Check: redirect to /login if not logged in ----
(function() {
    const stored = localStorage.getItem('quest_user');
    if (!stored) {
        window.location.href = '/login';
        return;
    }
    try {
        const user = JSON.parse(stored);
        const age = Date.now() - (user._saved_at || 0);
        if (age > 30 * 24 * 60 * 60 * 1000) {
            localStorage.removeItem('quest_user');
            window.location.href = '/login';
            return;
        }
    } catch (e) {
        localStorage.removeItem('quest_user');
        window.location.href = '/login';
    }
})();

// Logout function (global)
window.logoutUser = function() {
    localStorage.removeItem('quest_user');
    window.location.href = '/login';
};

document.addEventListener('DOMContentLoaded', () => {
    // ---- API Configuration (from config.js) ----
    const API_BASE_URL = typeof CONFIG !== 'undefined' ? CONFIG.API_BASE : 'http://localhost:3000';

    // ---- Display user chip ----
    const storedUser = localStorage.getItem('quest_user');
    if (storedUser) {
        try {
            const u = JSON.parse(storedUser);
            const chip = document.getElementById('navUserChip');
            const chipName = document.getElementById('navUserName');
            if (chip && chipName) {
                chipName.textContent = u.name.split(' ')[0];
                chip.style.display = 'flex';
            }
            fetch(`${API_BASE_URL}/api/users/wallet/${encodeURIComponent(u.usn)}`)
                .then((res) => res.json())
                .then((data) => {
                    if (chipName && data && data.success) {
                        chipName.textContent = `${u.name.split(' ')[0]} • Rs ${data.user.wallet_balance}`;
                    }
                })
                .catch(() => {});
            // Auto-fill booking form
            setTimeout(() => {
                const nameInput = document.getElementById('bookingName');
                const phoneInput = document.getElementById('bookingPhone');
                const usnInput = document.getElementById('bookingUSN');
                const emailInput = document.getElementById('bookingEmail');
                if (nameInput && !nameInput.value) nameInput.value = u.name || '';
                if (phoneInput && !phoneInput.value) phoneInput.value = u.phone || '';
                if (usnInput && !usnInput.value) usnInput.value = u.usn || '';
                if (emailInput && !emailInput.value) emailInput.value = u.email || '';
                // Show logged-in tag
                const tag = document.getElementById('loggedInTag');
                const tagName = document.getElementById('loggedInName');
                const tagUsn = document.getElementById('loggedInUsn');
                if (tag && tagName && tagUsn) {
                    tagName.textContent = u.name;
                    tagUsn.textContent = u.usn;
                    tag.style.display = 'block';
                }
            }, 200);
        } catch (e) {}
    }

    // ---- Fetch dynamic settings ----
    let QUEST_WHATSAPP = '919876543210';
    (async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/settings/public`);
            const data = await res.json();
            if (data.whatsapp_number) {
                QUEST_WHATSAPP = data.whatsapp_number.replace(/[\s+\-]/g, '');
            }
            window.QUEST_SETTINGS = data;
            // Update pricing displays
            if (data.ps5_rate_morning) {
                const el = document.getElementById('morningRateDisplay');
                const ps5Price = document.getElementById('ps5ServicePrice');
                const ps5Opt = document.getElementById('ps5OptionPrice');
                if (el) {
                    const nowH = new Date().getHours();
                    const service = 'ps5'; // default
                    el.textContent = `₹${data.ps5_rate_morning}/hr`;
                }
                if (ps5Price) ps5Price.innerHTML = `₹${data.ps5_rate_morning}<small>/hr</small>`;
                if (ps5Opt) ps5Opt.textContent = `from ₹${data.ps5_rate_morning}/hr`;
            }
            if (data.ps5_rate_afternoon) {
                const el = document.getElementById('afternoonRateDisplay');
                if (el) el.textContent = `₹${data.ps5_rate_afternoon}/hr`;
            }
            if (data.pool_rate_morning) {
                const poolPrice = document.getElementById('poolServicePrice');
                const poolOpt = document.getElementById('poolOptionPrice');
                if (poolPrice) poolPrice.innerHTML = `₹${data.pool_rate_morning}<small>/hr</small>`;
                if (poolOpt) poolOpt.textContent = `from ₹${data.pool_rate_morning}/hr`;
            }
            document.querySelectorAll('.pool-tier-price').forEach((el) => {
                const tier = el.dataset.tier;
                if (tier && data[`pool_rate_${tier}`]) {
                    el.textContent = `₹${data[`pool_rate_${tier}`]}/hr`;
                }
            });
            if (timelineMeta && data.buffer_time) {
                timelineMeta.textContent = `Live for today. 10:00 to late night • ${data.buffer_time} min reset buffer • morning rates before 12 PM, surge pricing after 12 PM.`;
            }
        } catch(e) { console.warn('Could not fetch settings'); }
    })();

    // ---- Smooth Scroll Reveal (Intersection Observer) ----
    const revealElements = document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        threshold: 0.15,
        rootMargin: '0px 0px -60px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // ---- Navbar Scroll Effect ----
    const navbar = document.getElementById('navbar');
    let lastScroll = 0;

    const onScroll = () => {
        const scrollY = window.scrollY;
        if (scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        lastScroll = scrollY;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ---- Active Nav Link on Scroll ----
    const sections = document.querySelectorAll('section[id]');
    const navLinksAll = document.querySelectorAll('.nav-link');

    const updateActiveNav = () => {
        const scrollY = window.scrollY + 200;
        sections.forEach(section => {
            const top = section.offsetTop;
            const height = section.offsetHeight;
            const id = section.getAttribute('id');
            if (scrollY >= top && scrollY < top + height) {
                navLinksAll.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${id}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    };

    window.addEventListener('scroll', updateActiveNav, { passive: true });

    // ---- Smooth Anchor Scroll ----
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = anchor.getAttribute('href');
            const target = document.querySelector(targetId);
            if (target) {
                const navHeight = navbar.offsetHeight;
                const targetPosition = target.offsetTop - navHeight;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                // Close mobile menu if open
                const navLinks = document.getElementById('navLinks');
                const navToggle = document.getElementById('navToggle');
                if (navLinks.classList.contains('active')) {
                    navLinks.classList.remove('active');
                    navToggle.classList.remove('active');
                    document.body.style.overflow = '';
                }
            }
        });
    });

    // ---- Mobile Navigation Toggle ----
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');

    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navLinks.classList.toggle('active');
        document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
    });

    // ---- Counter Animation ----
    const statNumbers = document.querySelectorAll('.stat-number');

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.dataset.count);
                animateCounter(el, 0, target, 2000);
                counterObserver.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    statNumbers.forEach(el => counterObserver.observe(el));

    function animateCounter(element, start, end, duration) {
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * eased);
            element.textContent = current.toLocaleString();
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    // ---- TIMELINE VIEW LOGIC ----
    const timelineContainer = document.getElementById('timelineContainer');
    const timelineControls = document.querySelector('.timeline-service-toggle');
    const timelineSvcBtns = document.querySelectorAll('.timeline-svc-btn');
    const nextSlotInfo = document.getElementById('nextSlotInfo');
    const nextSlotTime = document.getElementById('nextSlotTime');
    const timelineMeta = document.getElementById('timelineMeta');
    let currentTimelineSvc = 'ps5';
    let timelineRefreshTimer = null;
    let timelineEventSource = null;
    let selectedTimelineSlot = null;

    function formatDisplayTime(input) {
        const date = typeof input === 'string' ? new Date(input) : input;
        if (!date || Number.isNaN(date.getTime())) return '—';
        return date.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    }

    function syncSelectedSlotUI() {
        const summarySession = document.getElementById('summarySession');
        const slotTitle = document.getElementById('selectedTimelineSlotTitle');
        const slotCopy = document.getElementById('selectedTimelineSlotCopy');
        const desiredStart = document.getElementById('bookingDesiredStart');
        const preferredStation = document.getElementById('bookingPreferredStation');

        if (!summarySession || !slotTitle || !slotCopy || !desiredStart || !preferredStation) return;

        if (!selectedTimelineSlot) {
            summarySession.textContent = 'Auto-pick next live slot';
            slotTitle.textContent = 'We will auto-pick the next open slot for you.';
            slotCopy.textContent = 'Use the live availability section below to lock an exact station and minute-accurate start time.';
            desiredStart.value = '';
            preferredStation.value = '';
            return;
        }

        summarySession.textContent = `${formatDisplayTime(selectedTimelineSlot.startIso)} on ${selectedTimelineSlot.resourceLabel}`;
        slotTitle.textContent = `${selectedTimelineSlot.resourceLabel} from ${formatDisplayTime(selectedTimelineSlot.startIso)}`;
        slotCopy.textContent = selectedTimelineSlot.reason;
        desiredStart.value = selectedTimelineSlot.startIso;
        preferredStation.value = selectedTimelineSlot.stationId;
    }

    function clearSelectedSlot(message) {
        if (!selectedTimelineSlot) return;
        selectedTimelineSlot = null;
        syncSelectedSlotUI();
        if (message) {
            showBookingError(message);
        }
    }

    function selectedSlotStillValid(data) {
        if (!selectedTimelineSlot || !data || !data.timeline) return true;
        const station = data.timeline.find((item) => item.station_id === selectedTimelineSlot.stationId);
        if (!station || !station.next_available) return false;
        return new Date(station.next_available).getTime() === new Date(selectedTimelineSlot.startIso).getTime();
    }

    async function fetchTimeline() {
        if (!timelineContainer) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/availability/timeline?service=${currentTimelineSvc}`);
            const data = await res.json();
            if (data.success) {
                renderTimeline(data);
            }
        } catch (e) {
            timelineContainer.innerHTML = '<div class="timeline-loading">Failed to load timeline.</div>';
        }
    }

    function renderTimeline(data) {
        if (!data.timeline || data.timeline.length === 0) {
            timelineContainer.innerHTML = '<div class="timeline-loading">No stations available for this service.</div>';
            return;
        }

        if (timelineMeta) {
            timelineMeta.textContent = `Live for today. ${data.business_hours.open} to ${data.business_hours.close} • ${data.buffer_time} min reset buffer • morning rates before 12 PM, surge pricing after 12 PM.`;
        }

        const rowsHtml = data.timeline.map((station) => {
            const resourceLabel = `${currentTimelineSvc === 'ps5' ? 'PS5' : 'Pool'} ${station.station_number}`;
            const isSelected = selectedTimelineSlot
                && selectedTimelineSlot.stationId === station.station_id
                && selectedTimelineSlot.service === currentTimelineSvc;
            const actionHtml = station.next_available
                ? `<button class="timeline-slot-action ${isSelected ? 'selected' : ''}" type="button" onclick="selectTimeSlot('${station.next_available}', ${station.station_id}, '${resourceLabel}', 'Exact next slot after live booking and reset buffer')">${isSelected ? 'Selected' : 'Book'} ${formatDisplayTime(station.next_available)}</button>`
                : `<span class="timeline-slot-disabled">No 1-hour slot left</span>`;
            const eventsHtml = station.events.length
                ? station.events.map((event) => {
                    const eventClass = event.kind === 'blocked' ? 'blocked' : (event.kind === 'active' ? 'active' : 'booked');
                    const extra = (event.kind === 'booked' || event.kind === 'active')
                        ? `<span class="timeline-event-sub">Free again ${formatDisplayTime(event.available_at)}</span>`
                        : '';
                    return `<div class="timeline-event ${eventClass}">
                        <div>
                            <strong>${event.kind === 'blocked' ? 'Blocked' : event.label}</strong>
                            <span>${formatDisplayTime(event.start_time)} to ${formatDisplayTime(event.end_time)}</span>
                            ${extra}
                        </div>
                    </div>`;
                }).join('')
                : '<div class="timeline-empty">No bookings on this resource yet today.</div>';

            return `<article class="timeline-resource ${station.station_status === 'maintenance' ? 'maintenance' : ''}">
                <div class="timeline-resource-head">
                    <div>
                        <p class="timeline-resource-kicker">${resourceLabel}</p>
                        <h3>${station.now_label}</h3>
                        <p class="timeline-resource-copy">${currentTimelineSvc === 'ps5' ? `${station.working_controllers} controllers ready` : 'Reset buffer applied after every session'}</p>
                    </div>
                    <div class="timeline-resource-actions">
                        <span class="timeline-status-chip ${station.now_status}">${station.now_status.replace('_', ' ')}</span>
                        ${actionHtml}
                    </div>
                </div>
                <div class="timeline-events">${eventsHtml}</div>
            </article>`;
        }).join('');

        timelineContainer.innerHTML = `<div class="timeline-resource-grid">${rowsHtml}</div>`;

        if (data.next_available && data.next_available_iso) {
            nextSlotInfo.style.display = 'flex';
            nextSlotTime.textContent = `${formatDisplayTime(data.next_available_iso)}${data.next_available_station ? ` • ${currentTimelineSvc === 'ps5' ? 'PS5' : 'Pool'} ${data.next_available_station}` : ''}`;
        } else {
            nextSlotInfo.style.display = 'none';
        }

        if (!selectedSlotStillValid(data)) {
            clearSelectedSlot('Slot no longer available. The timeline has been refreshed with the latest booking changes.');
        }

        syncSelectedSlotUI();
    }

    // Expose selectTimeSlot globally so timeline can click it
    window.selectTimeSlot = function(startIso, stationId, resourceLabel, reason) {
        const slotDate = new Date(startIso);
        selectedTimelineSlot = {
            startIso,
            stationId,
            service: currentTimelineSvc,
            resourceLabel,
            reason: `${reason}. ${slotDate.getHours() < 12 ? 'Morning rate applies.' : 'Post-noon surge rate applies.'}`,
        };
        syncSelectedSlotUI();
        document.querySelector('input[name="service"][value="' + currentTimelineSvc + '"]').click();
        document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
    };

    if (timelineContainer) {
        if (window.EventSource) {
            timelineEventSource = new EventSource(`${API_BASE_URL}/api/availability/live`);
            timelineEventSource.addEventListener('timeline_update', () => {
                fetchTimeline();
            });
            timelineEventSource.onerror = () => {
                // Polling remains active as fallback.
            };
        }

        timelineSvcBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                timelineSvcBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTimelineSvc = btn.dataset.svc;
                if (selectedTimelineSlot && selectedTimelineSlot.service !== currentTimelineSvc) {
                    selectedTimelineSlot = null;
                }
                timelineContainer.innerHTML = '<div class="timeline-loading">Loading timeline...</div>';
                fetchTimeline();
            });
        });

        // Initial fetch and 30s polling
        fetchTimeline();
        timelineRefreshTimer = setInterval(fetchTimeline, 30000);
    }

    syncSelectedSlotUI();

    // ---- Gallery Lightbox ----
    const galleryItems = document.querySelectorAll('.gallery-item');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxPrev = document.getElementById('lightboxPrev');
    const lightboxNext = document.getElementById('lightboxNext');
    let currentGalleryIndex = 0;

    const gallerySources = [];
    galleryItems.forEach(item => {
        const img = item.querySelector('img');
        if (img) gallerySources.push(img.src);
    });

    galleryItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            currentGalleryIndex = index;
            lightboxImg.src = gallerySources[index];
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    });

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
    });

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }

    lightboxPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        currentGalleryIndex = (currentGalleryIndex - 1 + gallerySources.length) % gallerySources.length;
        lightboxImg.src = gallerySources[currentGalleryIndex];
    });

    lightboxNext.addEventListener('click', (e) => {
        e.stopPropagation();
        currentGalleryIndex = (currentGalleryIndex + 1) % gallerySources.length;
        lightboxImg.src = gallerySources[currentGalleryIndex];
    });

    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') lightboxPrev.click();
        if (e.key === 'ArrowRight') lightboxNext.click();
    });

    // ---- Booking Form Multi-Step ----
    const bookingForm = document.getElementById('bookingForm');
    const formSteps = document.querySelectorAll('.form-step');
    const stepDots = document.querySelectorAll('.step-dot');
    const formPrev = document.getElementById('formPrev');
    const formNext = document.getElementById('formNext');
    const btnConfirm = document.getElementById('btnConfirm');
    let currentStep = 1;

    const summaryService = document.getElementById('summaryService');
    const summaryDate = document.getElementById('summaryDate');
    const summaryTotal = document.getElementById('summaryTotal');

    function updateStepUI() {
        formSteps.forEach(step => {
            step.classList.remove('active');
            if (parseInt(step.dataset.step) === currentStep) {
                step.classList.add('active');
            }
        });
        stepDots.forEach(dot => {
            dot.classList.remove('active');
            if (parseInt(dot.dataset.step) <= currentStep) {
                dot.classList.add('active');
            }
        });
        formPrev.disabled = currentStep === 1;
        if (currentStep === 3) {
            formNext.style.display = 'none';
            // Enable confirm if form has required fields
            checkConfirmReady();
        } else {
            formNext.style.display = 'block';
        }
        updateSummary();
    }

    function checkConfirmReady() {
        const service = document.querySelector('input[name="service"]:checked');
        const name = document.getElementById('bookingName').value.trim();
        const phone = document.getElementById('bookingPhone').value.trim();
        const usn = document.getElementById('bookingUSN').value.trim();
        btnConfirm.disabled = !(service && name && phone && usn.length === 10);
    }

    function updateSummary() {
        const service = document.querySelector('input[name="service"]:checked');

        if (service) {
            summaryService.textContent = service.value === 'ps5' ? 'PS5 Gaming' : 'Pool Table';
            // Update step 2 service display
            const step2Display = document.getElementById('step2ServiceDisplay');
            if (step2Display) step2Display.textContent = service.value === 'ps5' ? 'PS5 Gaming' : 'Pool Table';
        }

        summaryDate.textContent = 'Today';
        syncSelectedSlotUI();

        // USN
        const usn = document.getElementById('bookingUSN');
        const usnRow = document.getElementById('summaryUsnRow');
        const usnVal = document.getElementById('summaryUSN');
        if (usn && usn.value.trim().length > 0) {
            usnVal.textContent = usn.value.trim().toUpperCase();
            usnRow.style.display = '';
        } else {
            usnRow.style.display = 'none';
        }

        // Rate
        if (service && window.QUEST_SETTINGS) {
            const pricingTime = selectedTimelineSlot ? new Date(selectedTimelineSlot.startIso) : new Date();
            const h = parseInt(pricingTime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }), 10);
            const isMorning = h < 12;
            let rate;
            let numPeople = 1;
            if (service.value === 'ps5') {
                rate = isMorning ? window.QUEST_SETTINGS.ps5_rate_morning : window.QUEST_SETTINGS.ps5_rate_afternoon;
                const playersChecked = document.querySelector('input[name="players"]:checked');
                numPeople = parseInt(playersChecked ? playersChecked.value : '1', 10);
            } else {
                const poolTierRadio = document.querySelector('input[name="pool_group_tier"]:checked');
                const cleanTier = poolTierRadio ? poolTierRadio.value : '4plus';
                const tierPeople = { '2plus': 2, '4plus': 4, '8plus': 8 };
                numPeople = tierPeople[cleanTier] || 2;
                rate = isMorning ? window.QUEST_SETTINGS.pool_rate_morning : window.QUEST_SETTINGS.pool_rate_afternoon;
            }
            summaryTotal.textContent = `₹${Number(rate) * numPeople} total (₹${rate} x ${numPeople})`;
        }

        // Pricing info card visibility
        const pricingInfo = document.getElementById('pricingInfo');
        if (service && pricingInfo) {
            pricingInfo.style.display = 'block';
            // Update morning/afternoon rates for selected service
            if (window.QUEST_SETTINGS) {
                const mEl = document.getElementById('morningRateDisplay');
                const aEl = document.getElementById('afternoonRateDisplay');
                
                if (service.value === 'ps5') {
                    if (mEl) mEl.textContent = `₹${window.QUEST_SETTINGS.ps5_rate_morning || 100}/hr`;
                    if (aEl) aEl.textContent = `₹${window.QUEST_SETTINGS.ps5_rate_afternoon || 150}/hr`;
                } else {
                    const poolTierRadio = document.querySelector('input[name="pool_group_tier"]:checked');
                    const cleanTier = poolTierRadio ? poolTierRadio.value : null;
                    if (cleanTier && window.QUEST_SETTINGS[`pool_rate_${cleanTier}`]) {
                        const tierPrice = window.QUEST_SETTINGS[`pool_rate_${cleanTier}`];
                        if (mEl) mEl.textContent = `₹${tierPrice}/hr`;
                        if (aEl) {
                            aEl.textContent = 'Selected Tier Rate';
                            aEl.parentElement.childNodes[0].textContent = '🎱 '; // Change icon text
                        }
                    } else {
                        if (mEl) mEl.textContent = `₹${window.QUEST_SETTINGS.pool_rate_morning || 150}/hr`;
                        if (aEl) aEl.textContent = `₹${window.QUEST_SETTINGS.pool_rate_afternoon || 200}/hr`;
                    }
                }
            }
        }

        // Players summary row
        const playersChecked = document.querySelector('input[name="players"]:checked');
        const playersRow = document.getElementById('summaryPlayersRow');
        const playersVal = document.getElementById('summaryPlayers');
        const poolTierRadio = document.querySelector('input[name="pool_group_tier"]:checked');
        
        if (service && service.value === 'ps5' && playersChecked) {
            const labels = { '1': '1 Player (Solo)', '2': '2 Players', '3': '3 Players', '4': '4 Players (Full)' };
            playersVal.textContent = labels[playersChecked.value] || `${playersChecked.value} Players`;
            playersRow.style.display = '';
            document.getElementById('summaryPlayersLabel').textContent = 'Players';
        } else if (service && service.value === 'pool' && poolTierRadio) {
            const labels = { '2plus': '2+ People', '4plus': '4+ People', '8plus': '8+ People' };
            playersVal.textContent = labels[poolTierRadio.value] || 'Group Size';
            playersRow.style.display = '';
            document.getElementById('summaryPlayersLabel').textContent = 'Group Size';
        } else {
            playersRow.style.display = 'none';
        }

        checkConfirmReady();
    }

    // Listen for changes
    bookingForm.addEventListener('change', updateSummary);
    bookingForm.addEventListener('input', updateSummary);

    // USN validation feedback
    const usnInput = document.getElementById('bookingUSN');
    if (usnInput) {
        usnInput.addEventListener('input', function() {
            const val = this.value.trim().toUpperCase();
            const msg = document.getElementById('usnValidMsg');
            if (!msg) return;
            if (val.length === 0) {
                msg.style.display = 'none';
            } else if (val.length < 10) {
                msg.textContent = `${val.length}/10 characters`;
                msg.style.color = '#a0a0a0';
                msg.style.display = 'block';
            } else if (/^[A-Z0-9]{10}$/.test(val)) {
                msg.textContent = '✓ Valid USN';
                msg.style.color = '#3B82F6';
                msg.style.display = 'block';
            } else {
                msg.textContent = 'Must be 10 alphanumeric characters';
                msg.style.color = '#ff4444';
                msg.style.display = 'block';
            }
            updateSummary();
        });
    }

    // Service radio changes — show/hide player count, pool tiers, and pricing
    document.querySelectorAll('input[name="service"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const playerSection = document.getElementById('playerCountSection');
            const poolTierSection = document.getElementById('poolTierSection');
            const controllerWarning = document.getElementById('controllerWarning');
            
            if (controllerWarning) controllerWarning.style.display = 'none';
            if (radio.checked && selectedTimelineSlot && radio.value !== selectedTimelineSlot.service) {
                selectedTimelineSlot = null;
                syncSelectedSlotUI();
            }

            if (radio.value === 'ps5' && radio.checked) {
                playerSection.style.display = 'block';
                if (poolTierSection) poolTierSection.style.display = 'none';
                checkControllers();
            } else {
                playerSection.style.display = 'none';
                const defaultPlayer = document.querySelector('input[name="players"][value="1"]');
                if (defaultPlayer) defaultPlayer.checked = true;
                
                if (poolTierSection && radio.checked) poolTierSection.style.display = 'block';
            }
            updateSummary();
        });
    });

    // Check PS5 Controller Capacity dynamically
    async function checkControllers() {
        const service = document.querySelector('input[name="service"]:checked');
        const players = document.querySelector('input[name="players"]:checked');
        const warningEl = document.getElementById('controllerWarning');
        const warningText = document.getElementById('controllerWarningText');
        const btnNext = document.getElementById('formNext');
        
        if (!service || service.value !== 'ps5' || !players || !warningEl) {
            if (warningEl) warningEl.style.display = 'none';
            return;
        }

        const count = parseInt(players.value);
        if (count === 1) {
            warningEl.style.display = 'none';
            btnNext.disabled = false;
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/availability/controllers?service=ps5&players=${count}`);
            const data = await res.json();
            
            if (data.success && !data.can_book) {
                warningText.textContent = data.message;
                warningEl.style.display = 'block';
                btnNext.disabled = true;
                btnNext.style.opacity = '0.5';
            } else {
                warningEl.style.display = 'none';
                btnNext.disabled = false;
                btnNext.style.opacity = '1';
            }
        } catch (e) {
            console.error('Controller check error', e);
        }
    }

    document.querySelectorAll('input[name="players"]').forEach(radio => {
        radio.addEventListener('change', () => {
            updateSummary();
            checkControllers();
        });
    });
    
    document.querySelectorAll('input[name="pool_group_tier"]').forEach(radio => {
        radio.addEventListener('change', updateSummary);
    });

    formNext.addEventListener('click', () => {
        if (currentStep === 1) {
            const service = document.querySelector('input[name="service"]:checked');
            if (!service) {
                shakeElement(document.querySelector('.service-select-grid'));
                return;
            }
        }
        // Step 2 is info-only, always proceed
        if (currentStep < 3) {
            currentStep++;
            updateStepUI();
        }
    });

    formPrev.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateStepUI();
        }
    });

    // Shake animation
    function shakeElement(el) {
        el.style.animation = 'none';
        el.offsetHeight;
        el.style.animation = 'shake 0.5s ease';
        setTimeout(() => { el.style.animation = ''; }, 500);
    }

    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
        @keyframes shake {
            0%, 100% { transform: translate3d(0, 0, 0); }
            20%, 60% { transform: translate3d(-8px, 0, 0); }
            40%, 80% { transform: translate3d(8px, 0, 0); }
        }
    `;
    document.head.appendChild(shakeStyle);

    // ---- Confirm Booking ----
    document.getElementById('btnConfirm').addEventListener('click', async (e) => {
        e.preventDefault();
        const service = document.querySelector('input[name="service"]:checked');
        const name = document.getElementById('bookingName').value.trim();
        const phone = document.getElementById('bookingPhone').value.trim();
        const usn = document.getElementById('bookingUSN').value.trim().toUpperCase();
        const email = document.getElementById('bookingEmail').value.trim();
        const notes = document.getElementById('bookingNotes').value.trim();
        const playersRadio = document.querySelector('input[name="players"]:checked');
        const poolTierRadio = document.querySelector('input[name="pool_group_tier"]:checked');
        
        const players = (service && service.value === 'ps5' && playersRadio) ? parseInt(playersRadio.value) : 1;
        const pool_group_tier = (service && service.value === 'pool' && poolTierRadio) ? poolTierRadio.value : null;

        if (!service || !name || !phone || usn.length !== 10) return;

        btnConfirm.disabled = true;
        btnConfirm.textContent = 'Processing...';

        // Debounce guard to prevent double submission
        if (window._bookingInFlight) return;
        window._bookingInFlight = true;

        try {
            // Removed pre-flight validate-slot call — the transactional re-check inside
            // the booking POST already handles this. The pre-flight was causing race
            // conditions leading to false 'slot no longer available' errors.

            const response = await fetch(`${API_BASE_URL}/api/bookings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service: service.value,
                    players,
                    pool_group_tier,
                    desired_start_time: document.getElementById('bookingDesiredStart').value || undefined,
                    preferred_station_id: document.getElementById('bookingPreferredStation').value || undefined,
                    name,
                    phone,
                    usn,
                    email: email || undefined,
                    notes: notes || undefined,
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                const serviceName = service.value === 'ps5' ? 'PS5 Gaming' : 'Pool Table';
                const ref = data.booking.reference_id;
                const modal = document.getElementById('bookingModal');
                const modalDetails = document.getElementById('modalDetails');

                // Loyalty check
                let loyaltyMsg = '';
                try {
                    const lRes = await fetch(`${API_BASE_URL}/api/bookings/loyalty?phone=${encodeURIComponent(phone)}`);
                    const lData = await lRes.json();
                    if (lData.total_bookings >= 5) {
                        loyaltyMsg = `<div style="margin-top:10px;padding:8px 14px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.25);border-radius:8px;font-size:13px;color:#3B82F6;">⭐ Regular Gamer! ${lData.total_bookings} visits — loyalty perks may apply.</div>`;
                    }
                } catch(e) {}

                const payUrl = `/payment?ref=${encodeURIComponent(ref)}`;
                const bookedTime = data.booking.time ? formatDisplayTime(`${data.booking.date}T${data.booking.time}:00`) : 'Now';
                const bookedStation = data.booking.station_number ? ` • ${service.value === 'ps5' ? 'PS5' : 'Pool'} ${data.booking.station_number}` : '';

                modalDetails.innerHTML = `<strong>Ref: ${ref}</strong><br>` +
                    `${serviceName}${bookedStation} • ${bookedTime} • USN: ${usn} • ${data.booking.num_people} people • ₹${data.booking.rate_per_person}/person/hr • Total ₹${data.booking.total_amount}` +
                    `${loyaltyMsg}<br>` +
                    `<a href="${payUrl}" style="display:inline-block;margin-top:14px;padding:12px 28px;background:#3B82F6;color:#fff;font-family:'Outfit',sans-serif;font-weight:700;font-size:14px;letter-spacing:1px;text-decoration:none;border-radius:8px;">PROCEED TO PAYMENT →</a>` +
                    `<br><a href="/session?ref=${ref}" target="_blank" style="color:#a0a0a0;font-size:12px;margin-top:8px;display:inline-block;">🕐 Track Session</a>`;
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
                fetchTimeline();
            } else {
                showBookingError(data.message || 'Booking failed. Please try again.');
                if (response.status === 409) {
                    clearSelectedSlot(data.message || 'Slot no longer available. Please pick another time.');
                    fetchTimeline();
                }
            }
        } catch (err) {
            console.error('Booking error:', err);
            showBookingError('Connection error. Please check your internet and try again.');
        } finally {
            btnConfirm.disabled = false;
            btnConfirm.textContent = 'CONFIRM BOOKING';
            window._bookingInFlight = false;
        }
    });

    function showBookingError(message) {
        let errorEl = document.getElementById('bookingError');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = 'bookingError';
            errorEl.style.cssText = 'background:rgba(255,60,60,0.1);border:1px solid rgba(255,60,60,0.4);color:#ff4444;padding:12px 16px;border-radius:8px;margin-top:12px;font-size:14px;text-align:center;';
            document.querySelector('.booking-summary .summary-content').appendChild(errorEl);
        }
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => { errorEl.style.display = 'none'; }, 6000);
    }

    // Modal close
    document.getElementById('modalClose').addEventListener('click', () => {
        document.getElementById('bookingModal').classList.remove('active');
        document.body.style.overflow = '';
        bookingForm.reset();
        currentStep = 1;
        updateStepUI();
        summaryService.textContent = '—';
        summaryDate.textContent = 'Today';
        summaryTotal.textContent = '—';
        selectedTimelineSlot = null;
        syncSelectedSlotUI();
        btnConfirm.disabled = true;
        const errorEl = document.getElementById('bookingError');
        if (errorEl) errorEl.style.display = 'none';
        // Re-fill user data
        const u = JSON.parse(localStorage.getItem('quest_user') || '{}');
        if (u.name) {
            document.getElementById('bookingName').value = u.name;
            document.getElementById('bookingPhone').value = u.phone || '';
            document.getElementById('bookingUSN').value = u.usn || '';
            document.getElementById('bookingEmail').value = u.email || '';
        }
    });

    // ---- Contact Form — calls backend API ----
    const contactForm = document.getElementById('contactForm');
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = contactForm.querySelector('.btn-submit');
        const originalText = btn.innerHTML;

        const name = document.getElementById('contactName').value;
        const email = document.getElementById('contactEmail').value;
        const subject = document.getElementById('contactSubject').value;
        const message = document.getElementById('contactMessage').value;

        if (!name || !email || !message) return;

        btn.innerHTML = '<span>SENDING...</span>';
        btn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    email,
                    subject: subject || undefined,
                    message,
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                btn.innerHTML = '<span>MESSAGE SENT ✓</span>';
                btn.style.background = '#25D366';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.background = '';
                    btn.disabled = false;
                    contactForm.reset();
                }, 3000);
            } else {
                showContactError(data.message || 'Failed to send. Please email us directly at hello@sidequestgaming.in');
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (err) {
            console.error('Contact error:', err);
            showContactError('Connection error. Please check your internet and try again.');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    function showContactError(msg) {
        let errEl = document.getElementById('contactError');
        if(!errEl) {
            errEl = document.createElement('div');
            errEl.id = 'contactError';
            errEl.style.cssText = 'color:#ff4444; font-size:13px; margin-top:10px; text-align:center; padding:10px; background:rgba(255,68,68,0.1); border-radius:6px; border:1px solid rgba(255,68,68,0.3);';
            contactForm.appendChild(errEl);
        }
        errEl.textContent = msg;
        errEl.style.display = 'block';
        setTimeout(() => { errEl.style.display = 'none'; }, 6000);
    }

    // ---- Footer Session Timer ----
    const footerSessionRef = document.getElementById('footerSessionRef');
    const footerSessionBtn = document.getElementById('footerSessionBtn');
    const footerSessionError = document.getElementById('footerSessionError');
    const footerSessionResult = document.getElementById('footerSessionResult');
    const footerSessionStatus = document.getElementById('footerSessionStatus');
    const footerSessionCountdown = document.getElementById('footerSessionCountdown');
    const footerSessionMeta = document.getElementById('footerSessionMeta');
    const footerSessionFullLink = document.getElementById('footerSessionFullLink');
    let footerTimerInterval = null;
    let footerRefreshInterval = null;
    let footerCurrentRef = '';

    function formatCountdown(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function clearFooterSessionIntervals() {
        clearInterval(footerTimerInterval);
        clearInterval(footerRefreshInterval);
    }

    function renderFooterSession(data) {
        const booking = data.booking;
        const session = data.session;
        let remainingMs = session.time_remaining_ms || 0;

        clearInterval(footerTimerInterval);
        footerSessionResult.style.display = 'block';
        footerSessionError.textContent = '';
        footerSessionFullLink.href = `/session?ref=${encodeURIComponent(booking.reference_id)}`;

        if (session.status === 'ended' || session.status === 'cancelled') {
            footerSessionStatus.textContent = session.status === 'cancelled' ? 'Booking cancelled' : 'Session ended';
            footerSessionCountdown.textContent = '00:00:00';
            footerSessionMeta.textContent = `${booking.name} • ${booking.service === 'ps5' ? 'PS5' : 'Pool'} • Ref ${booking.reference_id}`;
            return;
        }

        if (session.status === 'upcoming') {
            footerSessionStatus.textContent = 'Upcoming session';
            footerSessionCountdown.textContent = formatCountdown(remainingMs);
            footerSessionMeta.textContent = `${booking.name} • Starts at ${formatDisplayTime(`${booking.date}T${booking.time}:00`)}`;
        } else {
            footerSessionStatus.textContent = session.status === 'warning' ? 'Less than 10 min left' : 'Session active';
            footerSessionCountdown.textContent = formatCountdown(remainingMs);
            footerSessionMeta.textContent = `${booking.name} • ${booking.service === 'ps5' ? 'PS5' : 'Pool'} • ${booking.num_people || 1} people • ₹${booking.total_amount || 0} total`;
        }

        footerTimerInterval = setInterval(() => {
            if (remainingMs <= 0) {
                clearInterval(footerTimerInterval);
                footerSessionCountdown.textContent = '00:00:00';
                footerSessionStatus.textContent = 'Refreshing session status...';
                return;
            }
            remainingMs -= 1000;
            footerSessionCountdown.textContent = formatCountdown(remainingMs);
        }, 1000);
    }

    async function fetchFooterSession(ref) {
        const response = await fetch(`${API_BASE_URL}/api/session/${encodeURIComponent(ref)}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Session not found.');
        }
        renderFooterSession(data);
    }

    async function startFooterSessionLookup() {
        if (!footerSessionRef || !footerSessionBtn) return;
        const ref = footerSessionRef.value.trim();
        if (!ref) {
            footerSessionError.textContent = 'Enter a booking reference first.';
            footerSessionResult.style.display = 'none';
            return;
        }

        footerCurrentRef = ref;
        footerSessionError.textContent = '';
        footerSessionStatus.textContent = 'Loading...';
        footerSessionCountdown.textContent = '00:00:00';
        footerSessionMeta.textContent = '';
        footerSessionResult.style.display = 'block';

        clearFooterSessionIntervals();

        try {
            await fetchFooterSession(ref);
            footerRefreshInterval = setInterval(() => {
                fetchFooterSession(footerCurrentRef).catch(() => {});
            }, 30000);
        } catch (error) {
            footerSessionResult.style.display = 'none';
            footerSessionError.textContent = error.message || 'Unable to load session.';
        }
    }

    if (footerSessionBtn && footerSessionRef) {
        footerSessionBtn.addEventListener('click', startFooterSessionLookup);
        footerSessionRef.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                startFooterSessionLookup();
            }
        });
    }

    // Task 1: SSE listener for real-time session timer updates (extension sync)
    if (window.EventSource) {
        const sessionSSE = new EventSource(`${API_BASE_URL}/api/availability/live`);
        sessionSSE.addEventListener('timeline_update', (e) => {
            try {
                const data = JSON.parse(e.data);
                // If an extension event fires and we're tracking a session, re-fetch
                if (data.event_type === 'booking_extended' && footerCurrentRef) {
                    fetchFooterSession(footerCurrentRef).catch(() => {});
                }
            } catch (err) {
                // If we're tracking a session, re-fetch on any timeline update
                if (footerCurrentRef) {
                    fetchFooterSession(footerCurrentRef).catch(() => {});
                }
            }
        });
    }

    // ---- WhatsApp Widget ----
    const whatsappFab = document.getElementById('whatsappFab');
    const whatsappChat = document.getElementById('whatsappChat');
    const whatsappClose = document.getElementById('whatsappClose');
    const whatsappInput = document.getElementById('whatsappInput');
    const whatsappSend = document.getElementById('whatsappSend');
    const whatsappBadge = document.querySelector('.whatsapp-badge');

    whatsappFab.addEventListener('click', () => {
        whatsappChat.classList.toggle('active');
        if (whatsappBadge) whatsappBadge.style.display = 'none';
    });

    whatsappClose.addEventListener('click', () => {
        whatsappChat.classList.remove('active');
    });

    document.querySelectorAll('.quick-msg').forEach(btn => {
        btn.addEventListener('click', () => {
            const msg = btn.dataset.msg;
            sendToWhatsApp(msg);
        });
    });

    whatsappSend.addEventListener('click', () => {
        const msg = whatsappInput.value.trim();
        if (msg) sendToWhatsApp(msg);
    });

    whatsappInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const msg = whatsappInput.value.trim();
            if (msg) sendToWhatsApp(msg);
        }
    });

    function sendToWhatsApp(message) {
        const phoneNumber = QUEST_WHATSAPP;
        const encodedMsg = encodeURIComponent(message);
        const url = `https://wa.me/${phoneNumber}?text=${encodedMsg}`;
        window.open(url, '_blank');
        whatsappInput.value = '';
    }

    // ---- Parallax on Hero Elements ----
    const hero = document.querySelector('.hero');
    const ellipses = document.querySelectorAll('.ellipse');

    if (hero && window.innerWidth > 768) {
        let ticking = false;

        window.addEventListener('mousemove', (e) => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const x = (e.clientX / window.innerWidth - 0.5) * 2;
                    const y = (e.clientY / window.innerHeight - 0.5) * 2;

                    ellipses.forEach((el, i) => {
                        const factor = (i + 1) * 8;
                        el.style.transform = `translate(calc(-50% + ${x * factor}px), calc(-50% + ${y * factor}px))`;
                    });

                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    // ---- Service Card Tilt Effect ----
    if (window.innerWidth > 768) {
        document.querySelectorAll('.service-card').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                const rotateX = (y - 0.5) * -6;
                const rotateY = (x - 0.5) * 6;
                card.style.transform = `perspective(1000px) rotate3d(1, 0, 0, ${rotateX}deg) rotate3d(0, 1, 0, ${rotateY}deg) translate3d(0, -8px, 0)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });
        });
    }

    // ---- Cancellation Form ----
    const cancelForm = document.getElementById('cancelForm');
    if (cancelForm) {
        cancelForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ref = document.getElementById('cancelRef').value.trim();
            const phone = document.getElementById('cancelPhone').value.trim();
            const msgEl = document.getElementById('cancelMsg');
            if (!ref || !phone) return;

            msgEl.style.display = 'none';
            const btn = cancelForm.querySelector('.btn-submit');
            btn.querySelector('span').textContent = 'CANCELLING...';
            btn.disabled = true;

            try {
                const res = await fetch(`${API_BASE_URL}/api/bookings/cancel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reference_id: ref, phone }),
                });
                const data = await res.json();
                msgEl.textContent = data.message;
                msgEl.style.color = data.success ? '#3B82F6' : '#ff4444';
                msgEl.style.display = 'block';
                if (data.success) cancelForm.reset();
            } catch (err) {
                msgEl.textContent = 'Unable to connect. Please call us at +91 98765 43210.';
                msgEl.style.color = '#ff4444';
                msgEl.style.display = 'block';
            } finally {
                btn.querySelector('span').textContent = 'CANCEL BOOKING';
                btn.disabled = false;
            }
        });
    }
});
