// =========================================================================
// 1. NAVIGATION & VISUAL EFFECT UI OPERATIONS
// =========================================================================

// Navigation scroll background tint effect
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (!navbar) {
        return;
    }
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Mobile dropdown navigation menu toggle handler
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
}

// Smooth scroll to element sections
function scrollToSection(id) {
    const section = document.getElementById(id);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

// Active link state configuration matrix wrapper
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', function() {
        document.querySelectorAll('.nav-menu a').forEach(l => l.classList.remove('active'));
        this.classList.add('active');
        if (hamburger && navMenu) {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        }
    });
});

// Room filtering algorithm controls
const filterBtns = document.querySelectorAll('.filter-btn');
const roomCards = document.querySelectorAll('.room-card');

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.getAttribute('data-filter');

        roomCards.forEach(card => {
            if (filter === 'all' || card.getAttribute('data-category') === filter) {
                card.style.display = 'block';
                card.style.animation = 'fadeIn 0.5s ease';
            } else {
                card.style.display = 'none';
            }
        });
    });
});

// =========================================================================
// 2. MODAL VISUAL TOGGLE WRAPPERS (MAPPED TO HTML ONCLICK ATTRIBUTES)
// =========================================================================

// Opens the Authentication Modal panel layer container
function openLoginModal() {
    // Session-aware entry: if the visitor still holds a valid session from a
    // previous sign-in (set by auth.js), skip the login form entirely and go
    // straight to their dashboard. Only an explicit logout clears the session.
    const activeSession = window.SHMAAS_ACTIVE_SESSION;
    if (activeSession && activeSession.role) {
        window.location.href = activeSession.role === 'admin'
            ? 'admin.html'
            : activeSession.role === 'staff' ? 'staff.html' : 'student.html';
        return;
    }

    if (window.matchMedia('(min-width: 900px)').matches) {
        window.location.href = 'signup.html';
        return;
    }

    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

// Closes the Authentication Modal panel layer container
function closeLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function closeAuthModal() {
    closeLoginModal();
}

// Close any open modal windows instantly if user clicks gray backdrop spaces
window.onclick = function(event) {
    if (event.target.classList.contains('modal') || event.target.id === 'loginModal') {
        event.target.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

// =========================================================================
// 3. CONTACT FORM ENGINE UTILITIES
// =========================================================================
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        showToast('Message sent to hostel management.', 'success');
        this.reset();
    });
}

// =========================================================================
// 4. TOAST TO SYSTEM NOTIFICATION CONTROLLER ALERTS
// =========================================================================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Window globally scoped function sharing matrix hookups
window.showToast = showToast;
window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
window.closeAuthModal = closeAuthModal;

// =========================================================================
// 5. OBSERVER AND RENDER LOAD TIMELINE CONTROLS
// =========================================================================
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
        }
    });
}, observerOptions);

document.querySelectorAll('.feature-card, .room-card, .activity-card').forEach(el => {
    observer.observe(el);
});

// Enforce modern calendar configuration timelines
const today = new Date().toISOString().split('T')[0];
document.querySelectorAll('input[type=\"date\"]').forEach(input => {
    input.min = today;
});
