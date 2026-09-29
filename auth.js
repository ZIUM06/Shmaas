// =========================================================================
// 1. ALL GLOBAL IMPORTS (MUST BE PLACED TOGETHER AT THE VERY TOP)
// =========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    connectAuthEmulator, 
    sendEmailVerification,
    sendPasswordResetEmail,
    fetchSignInMethodsForEmail,
    signOut,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    connectFirestoreEmulator, 
    collection, 
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =========================================================================
// 2. FIREBASE CORE APP INITIALIZATION
// =========================================================================
const firebaseConfig = {
    apiKey: 'AIzaSyCB52CH0zuLg5SEfBG4eh_zpkoEfIjqfkU',
    authDomain: 'shmaas-3a0c6.firebaseapp.com',
    projectId: 'shmaas-3a0c6',
    messagingSenderId: '774113957832',
    appId: '1:774113957832:web:130f1dd20182665c49d2fd'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(error => {
    console.warn('Local login persistence unavailable:', error);
});
const ADMIN_LOGIN_EMAIL = 'adminshmaas@gmail.com';
const ADMIN_LOGIN_PASSWORD = 'TvetMaraBesut';
const USE_FIREBASE_EMULATORS = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && (
        window.location.port === '5000'
        || new URLSearchParams(window.location.search).get('emulators') === '1'
        || localStorage.getItem('shmaas_use_emulators') === 'true'
    );

// Export to window context so your non-module script.js can safely see it
window.db = db; 

// Connect automatically to your local emulator environment port layouts
if (USE_FIREBASE_EMULATORS) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

// Hosting uses cleanUrls, so auth pages live at "/login" and "/signup" in
// production but "/login.html" / "/signup.html" on plain static servers.
// Normalise once so session detection works in both environments.
const currentAuthPath = window.location.pathname.toLowerCase().replace(/\.html$/, '');
let isLoginMode = !currentAuthPath.endsWith('/signup');
const isDedicatedLoginPage = currentAuthPath.endsWith('/login');
const isRegistrationPage = currentAuthPath.endsWith('/signup');
const isLandingPage = currentAuthPath === '/' || currentAuthPath === '' || currentAuthPath.endsWith('/index');

// Keep users signed in: every auth entry point (login page, signup page, or the
// landing page) recognises an existing session and routes the user to their
// dashboard. The Firebase session itself lives in browserLocalPersistence, so
// it survives closing the browser or the PWA — only an explicit logout clears it.
if (isDedicatedLoginPage || isRegistrationPage || isLandingPage) {
    onAuthStateChanged(auth, async user => {
        if (!user || !user.emailVerified) {
            window.SHMAAS_ACTIVE_SESSION = null;
            return;
        }

        try {
            const profileSnap = await getDoc(doc(db, 'users', user.uid));
            const role = profileSnap.exists() ? (profileSnap.data().role || 'student') : 'student';
            window.SHMAAS_ACTIVE_SESSION = { role, email: user.email || '' };

            // Dedicated auth pages send returning users straight to their dashboard.
            // The landing page only exposes the session so its Login button can skip
            // the credential form (handled in script.js).
            if (isDedicatedLoginPage || isRegistrationPage) {
                window.location.replace(
                    role === 'admin' ? 'admin.html' : role === 'staff' ? 'staff.html' : 'student.html'
                );
            }
        } catch (error) {
            console.warn('Could not resolve the saved session role:', error);
        }
    });
}

function deriveBirthdayFromNric(nric) {
    const digits = String(nric || '').replace(/\D/g, '');
    if (digits.length !== 12) return '';
    const yy = Number(digits.slice(0, 2));
    const mm = Number(digits.slice(2, 4));
    const dd = Number(digits.slice(4, 6));
    if (!mm || mm > 12 || !dd || dd > 31) return '';
    const currentYear = new Date().getFullYear();
    let year = 2000 + yy;
    if (year > currentYear) {
        year -= 100;
    }
    const date = new Date(year, mm - 1, dd);
    if (Number.isNaN(date.getTime())) return '';
    if (date.getFullYear() !== year || date.getMonth() !== mm - 1 || date.getDate() !== dd) return '';
    return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

async function getStaffApproval(matrixNo) {
    const cleanedMatrix = String(matrixNo || '').trim().toUpperCase();
    if (!cleanedMatrix) return null;

    const approvalDoc = await getDoc(doc(db, 'allowedStaff', cleanedMatrix));
    return approvalDoc.exists() ? { id: approvalDoc.id, ...approvalDoc.data() } : null;
}

async function isStaffApproved(matrixNo) {
    const approval = await getStaffApproval(matrixNo);
    return approval?.active === true;
}

function normalizePhoneNumber(value) {
    return String(value || '').replace(/[^\d+]/g, '').trim();
}

function accountLifecycleStatus(profile = {}) {
    const rawStatus = String(profile.accountStatus || '').trim().toLowerCase();
    const expiresAt = profile.expiresAt?.toDate ? profile.expiresAt.toDate() : new Date(profile.expiresAt || 0);
    const deletionScheduledAt = profile.deletionScheduledAt?.toDate
        ? profile.deletionScheduledAt.toDate()
        : new Date(profile.deletionScheduledAt || 0);

    if (
        rawStatus === 'expired'
        || (profile.expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now())
        || (profile.deletionScheduledAt && !Number.isNaN(deletionScheduledAt.getTime()) && deletionScheduledAt.getTime() <= Date.now())
    ) {
        return 'Expired';
    }

    if (rawStatus === 'inactive' || profile.authDisabled === true || profile.disabled === true) {
        return 'Inactive';
    }

    return 'Active';
}

function rejectInactiveAccount(profile) {
    const status = accountLifecycleStatus(profile);
    if (status === 'Active') return false;

    const deadline = profile.deletionScheduledAt?.toDate
        ? profile.deletionScheduledAt.toDate().toLocaleString()
        : '';
    alert(status === 'Expired'
        ? 'This account has expired and is no longer available.'
        : `This account is inactive${deadline ? ` and is scheduled for deletion on ${deadline}` : ''}. Please contact an administrator.`);
    return true;
}

async function createStaffAccessRequest(user, fullName, matrixNo, phone, whatsappConfirmed = false) {
    const cleanedMatrix = String(matrixNo || '').trim().toUpperCase();
    const normalizedPhone = normalizePhoneNumber(phone);
    const requestRef = doc(db, 'staffAccessRequests', user.uid);

    await setDoc(requestRef, {
        uid: user.uid,
        fullName: String(fullName || '').trim(),
        email: user.email || '',
        matrixNo: cleanedMatrix,
        phone: normalizedPhone,
        whatsapp: normalizedPhone,
        whatsappConfirmed: whatsappConfirmed === true,
        status: 'pending',
        role: 'staff',
        message: 'Please review this staff registration request.',
        createdAt: new Date(),
        updatedAt: new Date()
    });
}

async function createApprovedStaffProfile(user, fullName, matrixNo, phone = '', whatsapp = '', staffRole = 'staff') {
    const cleanedMatrix = String(matrixNo || '').trim().toUpperCase();
    const normalizedPhone = normalizePhoneNumber(phone);
    const normalizedWhatsapp = normalizePhoneNumber(whatsapp || phone);
    const staffProfile = {
        uid: user.uid,
        fullName: String(fullName || '').trim(),
        role: 'staff',
        staffRole: String(staffRole || 'staff').trim() || 'staff',
        email: user.email,
        emailVerified: user.emailVerified,
        matrixNo: cleanedMatrix,
        matrixNumber: cleanedMatrix,
        phone: normalizedPhone,
        whatsapp: normalizedWhatsapp,
        whatsappConfirmed: true,
        nickname: '',
        homeAddress: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        roomNumber: '',
        bedNumber: '',
        facultyCourse: '',
        profileImage: '',
        accountStatus: 'Active',
        expiresAt: null,
        deletionScheduledAt: null,
        createdAt: new Date()
    };

    await setDoc(doc(db, 'users', user.uid), staffProfile);
    await setDoc(doc(db, 'staff', user.uid), staffProfile);
    return staffProfile;
}

function showStaffApprovalMessage() {
    alert(
        'Your staff request has been sent to the admin.\n\n' +
        'Your email must be verified, and the WhatsApp number you confirmed was saved with the request.\n' +
        'Please wait for admin approval before accessing the hostel dashboard.'
    );
}

// =========================================================================
// 3. LOGIN / REGISTRATION VISUAL INTERFACE TOGGLE
// =========================================================================
function getSelectedRole() {
    return document.getElementById('userRole')?.value || 'student';
}

function getStudentBlockEligibility(semester, gender, isCouncil) {
    const sem = String(semester || '').trim();
    const genderValue = String(gender || '').trim().toLowerCase();
    const council = String(isCouncil || 'false').toLowerCase() === 'true';
    const eligible = [];

    if (genderValue === 'male') {
        if (sem === '1' || council) {
            eligible.push('A101-A111', 'A201-A211');
        }
        if (sem >= '2' && sem <= '5') {
            eligible.push('B101-B111', 'B201-B211');
        }
    } else if (genderValue === 'female') {
        eligible.push('C101-C111');
    }

    return [...new Set(eligible)];
}

function updateRoleFields() {
    const role = getSelectedRole();
    const studentFields = document.querySelectorAll('.student-only');
    const staffFields = document.querySelectorAll('.staff-only');
    const isStudentRole = role === 'student';
    const isStaffRole = role === 'staff';

    studentFields.forEach(field => {
        const shouldShow = !isLoginMode && isStudentRole;
        field.style.display = shouldShow ? 'block' : 'none';
        field.querySelectorAll('input, select').forEach(control => {
            control.required = shouldShow;
        });
    });

    staffFields.forEach(field => {
        field.style.display = !isLoginMode && isStaffRole ? 'block' : 'none';
        const control = field.querySelector('input, select');
        if (control) control.required = !isLoginMode && isStaffRole;
    });
}

function updateAuthMode() {
    const modalTitle = document.getElementById('modalTitle');
    const modalSubtitle = document.getElementById('modalSubtitle');
    const submitBtn = document.getElementById('submitBtn');
    const toggleText = document.getElementById('toggleText');
    const loginOptions = document.getElementById('loginOptions');
    const registrationFields = document.querySelectorAll('.reg-only');

    registrationFields.forEach(field => {
        field.style.display = isLoginMode ? 'none' : 'block';
        const input = field.querySelector('input');
        if (input) input.required = !isLoginMode;
    });

    updateRoleFields();

    if (loginOptions) loginOptions.style.display = isLoginMode ? 'flex' : 'none';
    if (modalTitle) modalTitle.textContent = isLoginMode ? 'Login' : 'Register Account';
    if (modalSubtitle) {
        modalSubtitle.textContent = isLoginMode
            ? 'Sign in to continue to your portal'
            : 'Create a student or staff account';
    }
    if (submitBtn) submitBtn.textContent = isLoginMode ? 'Sign In' : 'Register';
    if (toggleText) {
        toggleText.innerHTML = isLoginMode
            ? 'Don\'t have an account? <a href="#" id="switchAuth" style="color: #7c4dff; font-weight: bold; text-decoration: none;">Create account</a>'
            : 'Already have an account? <a href="#" id="switchAuth" style="color: #7c4dff; font-weight: bold; text-decoration: none;">Sign in</a>';
    }
}

function openAdminLogin() {
    const adminModal = document.getElementById('adminLoginModal');
    const adminEmail = document.getElementById('adminEmail');
    if (adminModal) {
        adminModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        adminEmail?.focus?.();
    }
}

function closeAdminLogin() {
    const adminModal = document.getElementById('adminLoginModal');
    if (adminModal) {
        adminModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function togglePasswordField(button) {
    const targetId = button?.dataset?.target;
    const input = targetId ? document.getElementById(targetId) : null;
    if (!input) return;

    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    button.textContent = isHidden ? 'Hide' : 'Show';
}

async function emailCanReceivePasswordReset(email) {
    const signInMethods = await fetchSignInMethodsForEmail(auth, email);
    return Array.isArray(signInMethods) && signInMethods.length > 0;
}

function getPasswordResetMessage(error) {
    if (error?.code === 'auth/invalid-email') {
        return 'Please enter a valid email address.';
    }

    if (error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-login-credentials') {
        return 'Email is not registered. Try a different email.';
    }

    return error?.message || 'Unable to send password reset email.';
}

async function handleForgotPassword() {
    const emailInput = document.getElementById('email');
    const email = String(emailInput?.value || '').trim();
    const targetEmail = email || prompt('Enter your email address to receive a reset link:');

    if (!targetEmail) return;

    try {
        const normalizedEmail = targetEmail.trim().toLowerCase();
        const isRegisteredEmail = await emailCanReceivePasswordReset(normalizedEmail);

        if (!isRegisteredEmail) {
            alert('Email is not registered. Try a different email.');
            return;
        }

        await sendPasswordResetEmail(auth, normalizedEmail);
        alert(`Password reset email sent to ${normalizedEmail}. Please check your inbox and spam folder.`);
    } catch (error) {
        console.error('Password reset failed:', error);
        alert(getPasswordResetMessage(error));
    }
}

document.getElementById('userRole')?.addEventListener('change', updateRoleFields);

document.addEventListener('click', (e) => {
    const switchAuthLink = e.target?.closest?.('#switchAuth');
    if (switchAuthLink) {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        updateAuthMode();
        return;
    }

    const togglePasswordButton = e.target?.closest?.('.toggle-password');
    if (togglePasswordButton) {
        e.preventDefault();
        togglePasswordField(togglePasswordButton);
    }
});

window.openAdminLogin = openAdminLogin;
window.closeAdminLogin = closeAdminLogin;

async function ensureAdminProfile(user) {
    const userRef = doc(db, 'users', user.uid);
    const adminRef = doc(db, 'admins', user.uid);
    const existing = await getDoc(userRef);
    const adminMatrixNo = 'ADMIN001';

    const adminProfile = {
        uid: user.uid,
        fullName: 'Admin',
        role: 'admin',
        email: user.email,
        emailVerified: user.emailVerified === true,
        matrixNo: adminMatrixNo,
        matrixNumber: adminMatrixNo,
        nickname: '',
        homeAddress: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        roomNumber: '',
        bedNumber: '',
        facultyCourse: '',
        profileImage: '',
        accountStatus: existing.exists() ? (existing.data().accountStatus || 'Active') : 'Active',
        expiresAt: existing.exists() ? (existing.data().expiresAt || null) : null,
        deletionScheduledAt: existing.exists() ? (existing.data().deletionScheduledAt || null) : null,
        createdAt: existing.exists() ? (existing.data().createdAt || new Date()) : new Date()
    };

    await setDoc(userRef, adminProfile, { merge: true });
    await setDoc(adminRef, adminProfile, { merge: true });
}

updateAuthMode();

function applyAuthRouteFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const hashRoute = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    const requestedMode = params.get('auth') || (['login', 'register'].includes(hashRoute) ? hashRoute : null);
    if (!['login', 'register'].includes(requestedMode)) return;

    isLoginMode = requestedMode !== 'register';
    updateAuthMode();

    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    params.delete('auth');
    const nextQuery = params.toString();
    const shouldClearHash = ['login', 'register'].includes(hashRoute);
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${shouldClearHash ? '' : (window.location.hash || '')}`;
    window.history.replaceState({}, document.title, nextUrl);
}

applyAuthRouteFromUrl();

// =========================================================================
// 4. AUTHENTICATION FLOW WORKER (WITH LIVE MAIL VERIFICATION CONTROL)
// =========================================================================
document.addEventListener('submit', async (e) => {
    if (e.target && e.target.id === 'adminLoginForm') {
        e.preventDefault();

        const email = document.getElementById('adminEmail').value.trim().toLowerCase();
        const password = document.getElementById('adminPassword').value;

        if (email !== ADMIN_LOGIN_EMAIL || password !== ADMIN_LOGIN_PASSWORD) {
            alert('Invalid admin username or password.');
            return;
        }

        try {
            let userCredential;

            try {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                    try {
                        userCredential = await createUserWithEmailAndPassword(auth, email, password);
                        await ensureAdminProfile(userCredential.user);
                        await sendEmailVerification(userCredential.user);
                        await signOut(auth);
                        closeAdminLogin();
                        alert('Admin account created. A verification email has been sent to adminshmaas@gmail.com. Please verify it before logging in.');
                        return;
                    } catch (createError) {
                        if (createError.code === 'auth/email-already-in-use') {
                            throw new Error('That admin email already exists. Please check the password or verify the email first.');
                        }
                        throw createError;
                    }
                }
                throw error;
            }

            const user = userCredential.user;

            if (!user.emailVerified) {
                await sendEmailVerification(user);
                await signOut(auth);
                closeAdminLogin();
                alert('Please verify the admin email address first. A new verification email has been sent to adminshmaas@gmail.com.');
                return;
            }

            await ensureAdminProfile(user);
            const adminProfileSnap = await getDoc(doc(db, 'users', user.uid));
            if (adminProfileSnap.exists() && rejectInactiveAccount(adminProfileSnap.data())) {
                await signOut(auth);
                return;
            }

            sessionStorage.setItem('userEmail', ADMIN_LOGIN_EMAIL);
            sessionStorage.setItem('userRole', 'admin');
            sessionStorage.setItem('fullName', 'Admin');
            sessionStorage.setItem('isAdminAuthenticated', 'true');
            sessionStorage.removeItem('isStaffAuthenticated');
            sessionStorage.removeItem('isStudentAuthenticated');

            closeAdminLogin();
            window.location.href = 'admin.html';
        } catch (error) {
            console.error('Admin login failed:', error);
            alert(error.message || 'Unable to sign in as admin.');
        }
        return;
    }

    if (e.target && e.target.id === 'authForm') {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (isLoginMode) {
            // --- LOG IN FLOW ---
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                const userRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userRef);
                const staffRequestDoc = await getDoc(doc(db, 'staffAccessRequests', user.uid));

                // CHECK IF EMAIL IS VERIFIED
                if (!user.emailVerified) {
                    alert("Your account is not active yet! Please check your inbox and click the verification link before logging in.");
                    await signOut(auth); 
                    return; 
                }

                if (!userDoc.exists()) {
                    if (staffRequestDoc.exists()) {
                        const requestData = staffRequestDoc.data() || {};
                        const requestedMatrix = String(requestData.matrixNo || '').trim().toUpperCase();
                        const staffApproval = await getStaffApproval(requestedMatrix);

                        if (staffApproval?.active !== true) {
                            await signOut(auth);
                            showStaffApprovalMessage();
                            return;
                        }

                        const approvedStaffPhone = normalizePhoneNumber(requestData.phone || requestData.whatsapp || '');
                        const fallbackStaffPhone = approvedStaffPhone || normalizePhoneNumber(prompt('Enter the phone number linked to your WhatsApp for student contact:') || '');
                        if (!fallbackStaffPhone) {
                            await signOut(auth);
                            alert('A WhatsApp-linked phone number is required before staff dashboard access can be activated.');
                            return;
                        }

                        const createdProfile = await createApprovedStaffProfile(
                            user,
                            requestData.fullName || user.displayName || user.email || 'Staff',
                            requestedMatrix,
                            fallbackStaffPhone,
                            requestData.whatsapp || fallbackStaffPhone,
                            staffApproval.staffRole || 'staff'
                        );

                        sessionStorage.setItem('userEmail', user.email);
                        sessionStorage.setItem('userRole', 'staff');
                        sessionStorage.setItem('staffRole', createdProfile.staffRole || 'staff');
                        sessionStorage.setItem('fullName', createdProfile.fullName || requestData.fullName || '');
                        sessionStorage.setItem('staffMatrixNo', requestedMatrix);
                        sessionStorage.setItem('isStaffAuthenticated', 'true');
                        sessionStorage.removeItem('isAdminAuthenticated');
                        sessionStorage.removeItem('isStudentAuthenticated');

                        alert("Staff approval received. Redirecting to the staff dashboard.");
                        window.location.href = "staff.html";
                        return;
                    }

                    const shouldCreateStudentProfile = confirm(
                        "Your login account exists, but your student profile was not created. Do you want to create the missing student profile now?"
                    );

                    if (shouldCreateStudentProfile) {
                        const recoveryName = prompt("Enter your full name:");
                        const recoveryNric = prompt("Enter your NRIC number:");
                        const recoveryMatrix = prompt("Enter your matrix number (optional):");

                        if (!recoveryName || !recoveryNric) {
                            alert("Profile recovery cancelled. Please enter valid student details.");
                            await signOut(auth);
                            return;
                        }

                        const recoveredProfile = {
                            uid: user.uid,
                            fullName: recoveryName.trim(),
                            nickname: '',
                            role: 'student',
                            icNumber: recoveryNric.trim(),
                            nric: recoveryNric.trim(),
                            matrixNumber: recoveryMatrix?.trim() || '',
                            matrixNo: recoveryMatrix?.trim() || '',
                            birthday: deriveBirthdayFromNric(recoveryNric.trim()),
                            homeAddress: '',
                            emergencyContactName: '',
                            emergencyContactPhone: '',
                            roomNumber: '',
                            bedNumber: '',
                            facultyCourse: '',
                            profileImage: '',
                            email: user.email,
                            emailVerified: user.emailVerified,
                            accountStatus: 'Active',
                            expiresAt: null,
                            deletionScheduledAt: null,
                            createdAt: new Date()
                        };

                        await setDoc(doc(db, "users", user.uid), recoveredProfile);
                        await setDoc(doc(db, "students", user.uid), recoveredProfile);

                        sessionStorage.setItem('userEmail', user.email);
                        sessionStorage.setItem('userRole', 'student');
                        sessionStorage.setItem('fullName', recoveredProfile.fullName);
                        sessionStorage.setItem('isStudentAuthenticated', 'true');
                        sessionStorage.removeItem('isStaffAuthenticated');

                        alert("Student profile recovered successfully!");
                        window.location.href = "student.html";
                        return;
                    }

                    const shouldResetAccount = confirm(
                        "Do you want to remove this broken login account so you can register again?"
                    );

                    if (shouldResetAccount) {
                        await deleteUser(user);
                        alert("Broken account removed. Please register again.");
                    } else {
                        await signOut(auth);
                    }

                    return;
                }

                const userProfile = userDoc.data();
                if (rejectInactiveAccount(userProfile)) {
                    await signOut(auth);
                    return;
                }
                const userRole = userProfile.role || 'student';

                // SAVE SESSION TRACKING KEYS
                sessionStorage.setItem('userEmail', user.email);
                sessionStorage.setItem('userRole', userRole);
                sessionStorage.setItem('fullName', userProfile.fullName || '');

                if (userRole === 'admin') {
                    sessionStorage.setItem('isAdminAuthenticated', 'true');
                    sessionStorage.removeItem('isStaffAuthenticated');
                    sessionStorage.removeItem('isStudentAuthenticated');

                    alert("Admin logged in successfully!");
                    window.location.href = "admin.html";
                    return;
                }

                if (userRole === 'staff') {
                    const staffApproval = await getStaffApproval(userProfile.matrixNo || userProfile.matrixNumber || '');
                    if (staffApproval?.active !== true) {
                        await signOut(auth);
                        showStaffApprovalMessage();
                        return;
                    }

                    const resolvedStaffRole = staffApproval.staffRole || userProfile.staffRole || 'staff';

                    sessionStorage.setItem('isStaffAuthenticated', 'true');
                    sessionStorage.removeItem('isAdminAuthenticated');
                    sessionStorage.removeItem('isStudentAuthenticated');
                    sessionStorage.setItem('staffMatrixNo', userProfile.matrixNo || userProfile.matrixNumber || '');
                    sessionStorage.setItem('staffRole', resolvedStaffRole);

                    if (userProfile.staffRole !== resolvedStaffRole) {
                        await setDoc(doc(db, 'users', user.uid), {
                            staffRole: resolvedStaffRole
                        }, { merge: true });
                        await setDoc(doc(db, 'staff', user.uid), {
                            staffRole: resolvedStaffRole
                        }, { merge: true });
                    }

                    alert("Staff logged in successfully!");
                    window.location.href = "staff.html";
                    return;
                }

                sessionStorage.setItem('isStudentAuthenticated', 'true');
                sessionStorage.removeItem('isStaffAuthenticated');
                sessionStorage.removeItem('isAdminAuthenticated');

                alert("Student logged in successfully!");
                window.location.href = "student.html"; 
            } catch (error) {
                alert("Login Failed: " + error.message);
            }
        } else {
            // --- REGISTRATION FLOW ---
            const fullName = document.getElementById('fullName').value.trim();
            const role = getSelectedRole();
            const nric = document.getElementById('nric').value.trim();
            const semester = document.getElementById('semester')?.value || '';
            const gender = document.getElementById('gender')?.value || '';
            const isCouncil = false;
            const matrixNo = document.getElementById('matrixNo').value.trim();
            const staffPhone = document.getElementById('staffPhone')?.value.trim() || '';
            const staffWhatsappConfirmed = document.getElementById('staffWhatsappConfirm')?.checked === true;
            const confirmPassword = document.getElementById('confirmPassword')?.value || '';

            if (!['student', 'staff'].includes(role)) {
                alert("Invalid registration role.");
                return;
            }

            if (role === 'student' && !nric) {
                alert("Please enter your NRIC number.");
                return;
            }

            const studentBirthday = role === 'student' ? deriveBirthdayFromNric(nric) : '';
            if (role === 'student' && !studentBirthday) {
                alert("Please enter a valid 12-digit Malaysian NRIC. The first six digits must contain a valid birth date (YYMMDD).");
                return;
            }

            if (role === 'student') {
                if (!semester || !gender) {
                    alert("Please select your semester and gender.");
                    return;
                }

                if (!getStudentBlockEligibility(semester, gender, isCouncil).length) {
                    alert("This registration does not match any hostel block rule.");
                    return;
                }
            }

            if (role === 'staff' && !matrixNo) {
                alert("Please enter your staff matrix number.");
                return;
            }

            if (role === 'staff' && !staffPhone) {
                alert("Please enter the phone number linked to your WhatsApp.");
                return;
            }

            if (role === 'staff' && !staffWhatsappConfirmed) {
                alert("Please confirm that you own this WhatsApp number and can receive student messages on it.");
                return;
            }

            if (password !== confirmPassword) {
                alert("Password and confirm password must match.");
                return;
            }
            
            let createdUser = null;
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                createdUser = user;

                // Write profile to local Firestore Emulator database file
                const userProfile = {
                    uid: user.uid,
                    fullName: fullName,
                    role: role,
                    icNumber: role === 'student' ? nric : null,
                    nric: role === 'student' ? nric : null,
                    birthday: role === 'student' ? studentBirthday : null,
                    semester: role === 'student' ? semester : '',
                    gender: role === 'student' ? gender : '',
                    isCouncil: role === 'student' ? isCouncil : false,
                    eligibleBlocks: role === 'student' ? getStudentBlockEligibility(semester, gender, isCouncil) : [],
                    matrixNumber: role === 'student' ? '' : matrixNo,
                    matrixNo: role === 'staff' ? matrixNo : '',
                    phone: role === 'staff' ? normalizePhoneNumber(staffPhone) : '',
                    whatsapp: role === 'staff' ? normalizePhoneNumber(staffPhone) : '',
                    whatsappConfirmed: role === 'staff' ? staffWhatsappConfirmed : false,
                    nickname: '',
                    homeAddress: '',
                    emergencyContactName: '',
                    emergencyContactPhone: '',
                    roomNumber: '',
                    bedNumber: '',
                    facultyCourse: '',
                    profileImage: '',
                    email: email,
                    emailVerified: false,
                    accountStatus: 'Active',
                    expiresAt: null,
                    deletionScheduledAt: null,
                    createdAt: new Date()
                };

                if (role === 'student') {
                    await setDoc(doc(db, "users", user.uid), userProfile);
                    await setDoc(doc(db, "students", user.uid), userProfile);
                } else {
                    await createStaffAccessRequest(user, fullName, matrixNo, staffPhone, staffWhatsappConfirmed);
                    await sendEmailVerification(user);
                    await signOut(auth);
                    showStaffApprovalMessage();
                    isLoginMode = true;
                    location.reload();
                    return;
                }

                // Send verification only after the profile documents are created successfully
                await sendEmailVerification(user);

                if (role === 'student') {
                    await signOut(auth);
                    sessionStorage.removeItem('userEmail');
                    sessionStorage.removeItem('userRole');
                    sessionStorage.removeItem('fullName');
                    sessionStorage.removeItem('semester');
                    sessionStorage.removeItem('gender');
                    sessionStorage.removeItem('isCouncil');
                    sessionStorage.removeItem('isStudentAuthenticated');
                    sessionStorage.removeItem('isStaffAuthenticated');
                    sessionStorage.removeItem('isAdminAuthenticated');

                    alert(`Student registration successful. Eligible blocks: ${getStudentBlockEligibility(semester, gender, isCouncil).join(', ')}.\n\nA verification link has been sent to your email. Please verify your email, then login to book a bed.`);
                    isLoginMode = true;
                    updateAuthMode();
                    window.closeLoginModal?.();
                    return;
                }

                alert("Registration successful! A verification link has been sent to your email. Please verify your email before logging in.");

                // Reset structural form views back to clean layout page
                isLoginMode = true;
                location.reload();
                
            } catch (error) {
                if (createdUser) {
                    try {
                        await deleteUser(createdUser);
                    } catch (deleteError) {
                        console.error("Could not clean up incomplete account: ", deleteError);
                    }
                }
                alert("Registration Failed: " + error.message);
            }
        }
    }
});

// =========================================================================
// 5. REAL-TIME BED AVAILABILITY MATRIX CONTROLLER
// =========================================================================
const BEDS_PER_ROOM = 6;
const AVAILABILITY_RANGES = [
    { id: 'A101-A111', totalRooms: 11 },
    { id: 'A201-A211', totalRooms: 11 },
    { id: 'B101-B111', totalRooms: 11 },
    { id: 'B201-B211', totalRooms: 11 },
    { id: 'C101-C111', totalRooms: 11 }
];

function totalBedsForRange(range) {
    return range.totalRooms * BEDS_PER_ROOM;
}

function renderBedAvailability(rangeId, occupiedBeds = 0) {
    const range = AVAILABILITY_RANGES.find(item => item.id === rangeId);
    if (!range) return;

    const absoluteMaxBeds = totalBedsForRange(range);
    const currentBedsFree = Math.max(absoluteMaxBeds - Number(occupiedBeds || 0), 0);
    const studentElement = document.getElementById(`avail-${range.id}`);

    if (studentElement) {
        studentElement.innerHTML = currentBedsFree <= 0
            ? `<span class="beds-count full">FULLY BOOKED (0/${absoluteMaxBeds})</span>`
            : `<span class="beds-count available">${currentBedsFree} / ${absoluteMaxBeds} Beds Free</span>`;
    }

    const adminElement = document.getElementById(`admin-avail-${range.id}`);
    if (adminElement) {
        adminElement.textContent = `${currentBedsFree} Beds Left`;
        adminElement.style.color = currentBedsFree < 10 ? '#ef4444' : '#10b981';
    }
}

function setDefaultBedAvailability() {
    AVAILABILITY_RANGES.forEach(range => renderBedAvailability(range.id, 0));
}

function listenToPublicBedAvailability() {
    setDefaultBedAvailability();

    onSnapshot(collection(db, "publicAvailability"), (snapshot) => {
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            renderBedAvailability(docSnap.id, data.occupiedBeds || 0);
        });
    }, (error) => {
        console.error("Public availability sync failed: ", error);
        setDefaultBedAvailability();
    });
}

function listenToPrivateBookingAvailability() {
    onSnapshot(collection(db, "bookings"), async (snapshot) => {
        const activeBookings = snapshot.docs.map(docSnap => docSnap.data());

        for (const range of AVAILABILITY_RANGES) {
            const allocatedCount = activeBookings.filter(booking => booking.roomRange === range.id).length;
            renderBedAvailability(range.id, allocatedCount);

            try {
                await setDoc(doc(db, "publicAvailability", range.id), {
                    occupiedBeds: allocatedCount,
                    totalBeds: totalBedsForRange(range),
                    updatedAt: new Date()
                }, { merge: true });
            } catch (error) {
                console.warn("Could not publish availability summary: ", error);
            }
        }
    }, (error) => {
        console.error("Private booking sync failed: ", error);
    });
}

listenToPublicBedAvailability();

if (sessionStorage.getItem('isStudentAuthenticated') === 'true' || sessionStorage.getItem('isStaffAuthenticated') === 'true') {
    listenToPrivateBookingAvailability();
}

