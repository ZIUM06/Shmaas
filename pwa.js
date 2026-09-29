(function () {
    let installPrompt = null;

    function isAppleMobile() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera || "";
        return /iPhone|iPad|iPod/i.test(userAgent);
    }

    function isAndroid() {
        return /Android/i.test(navigator.userAgent || "");
    }

    function isStandalone() {
        return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }

    function showInstallGuide() {
        const statusBanner = document.getElementById("installStatusBanner");
        if (!statusBanner) {
            return;
        }

        statusBanner.hidden = false;

        if (isAppleMobile()) {
            statusBanner.textContent = "On iPhone or iPad: open this page in Safari, tap Share, then tap Add to Home Screen.";
            return;
        }

        if (isAndroid()) {
            statusBanner.textContent = "On Android: open this page in Chrome, Edge, or Samsung Internet, then use the browser menu and choose Install app or Add to Home screen.";
            return;
        }

        statusBanner.textContent = "Direct install is only supported by some browsers. Open this page on your phone, or use your browser menu and choose Install app or Add to Home screen.";
    }

    function updateDownloadPageState() {
        const installButton = document.getElementById("downloadInstallButton");
        const availabilityText = document.getElementById("installAvailabilityText");
        const buttonHelp = document.getElementById("installButtonHelp");
        const statusBanner = document.getElementById("installStatusBanner");

        if (!installButton || !availabilityText || !buttonHelp) {
            return;
        }

        if (isStandalone()) {
            installButton.disabled = true;
            availabilityText.textContent = "SHMaaS is already installed on this device.";
            buttonHelp.textContent = "You can open it directly from your Home Screen or app launcher.";
            if (statusBanner) {
                statusBanner.hidden = false;
                statusBanner.textContent = "Installed successfully. Open SHMaaS from your Home Screen.";
            }
            return;
        }

        if (installPrompt) {
            installButton.disabled = false;
            availabilityText.textContent = "This browser supports direct installation.";
            buttonHelp.textContent = "Tap Download App to add SHMaaS to your device.";
            return;
        }

        if (isAppleMobile()) {
            installButton.disabled = false;
            availabilityText.textContent = "Safari on iPhone or iPad uses Add to Home Screen instead of a popup install prompt.";
            buttonHelp.textContent = "Tap Download App to view the install steps.";
            return;
        }

        installButton.disabled = false;
        availabilityText.textContent = "Direct download depends on your browser.";
        buttonHelp.textContent = "Tap Download App to install, or to see the manual install steps.";
    }

    function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) {
            return;
        }

        navigator.serviceWorker.register("sw.js", { scope: "./" }).catch((error) => {
            console.warn("SHMaaS offline support could not start:", error);
        });
    }

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        installPrompt = event;
        updateDownloadPageState();
    });

    window.addEventListener("appinstalled", () => {
        installPrompt = null;
        updateDownloadPageState();
    });

    document.addEventListener("click", async (event) => {
        const trigger = event.target.closest("#downloadInstallButton");
        if (!trigger) {
            return;
        }

        if (!installPrompt) {
            updateDownloadPageState();
            showInstallGuide();
            return;
        }

        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        updateDownloadPageState();
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            registerServiceWorker();
            updateDownloadPageState();
        }, { once: true });
    } else {
        registerServiceWorker();
        updateDownloadPageState();
    }
})();
