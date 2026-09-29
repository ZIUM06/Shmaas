(function () {
    const fallbackMessage = "Sorry, I couldn't get a response right now. Please try again in a moment.";
    const configuredApiBase = String(window.SHMAAS_CHATBOT_API_BASE || "").replace(/\/+$/, "");
    const endpoint = configuredApiBase ? `${configuredApiBase}/api/chat` : "/api/chat";
    const assetVersion = "20260818-intelligent-fallback";
    const shmiaImage = `assets/shmia-chatbot.png?v=${assetVersion}`;
    const conversationHistory = [];
    const offlineAnswers = [
        {
            keywords: ["book", "booking", "reserve", "bed", "room booking", "book room", "tempah", "bilik", "katil"],
            reply: "Log in as a student, choose Stay in Hostel, then select your eligible block, room, bed, and check-in date. Each student can book one bed only."
        },
        {
            keywords: ["available", "availability", "empty", "vacant"],
            reply: "Live room and bed availability appears during student booking. Log in and open Rooms or start the hostel booking steps for the latest status."
        },
        {
            keywords: ["roommate", "room mate", "housemate", "mate", "rakan sebilik", "siapa bilik", "who is my roommate"],
            reply: "I may not have live access to your roommate details here. Please check your student dashboard or booking page. If it is still not shown, contact hostel management with your room number."
        },
        {
            keywords: ["warden", "waren", "on duty", "duty", "bertugas", "staff duty", "siapa bertugas", "who is on duty"],
            reply: "Open your student dashboard and use Duty Lookup to check the assigned warden for a specific date."
        },
        {
            keywords: ["block", "b1", "b2", "block a", "block c"],
            reply: "SHMaaS uses Block A1, Block A2, Block B1, Block B2, and Block C. Eligible blocks depend on the student's profile and current hostel rules."
        },
        {
            keywords: ["login", "sign in", "account"],
            reply: "Please sign in before booking. Desktop users can register or sign in on the website account page; mobile app users use the app login page."
        },
        {
            keywords: ["signup", "sign up", "register", "create account"],
            reply: "On desktop, open the website registration page. In the mobile app, open Login and choose Create account. Verify your email before signing in."
        },
        {
            keywords: ["forgot", "password", "reset"],
            reply: "Use Forgot password on the login form. Enter your registered email address and follow the reset instructions."
        },
        {
            keywords: ["payment", "price", "fee", "pay", "cost"],
            reply: "No price is shown and no payment is charged in this SHMaaS booking system."
        },
        {
            keywords: ["status", "approved", "pending", "assigned"],
            reply: "After logging in, check your student dashboard to see your booking status, assigned room, bed, and duty information."
        },
        {
            keywords: ["contact", "phone", "address", "office", "urgent", "management", "hubungi", "telefon", "kecemasan"],
            reply: "For exact office phone numbers, address details, check-in dates, or urgent issues, please use the website Contact section or speak directly with hostel management."
        },
        {
            keywords: ["check in", "check-in", "checkout", "check out"],
            reply: "For exact check-in or check-out dates, please refer to the website Contact section or confirm with hostel management."
        },
        {
            keywords: ["outing", "go out", "going out", "keluar", "outing request"],
            reply: "Open the Student Portal, choose Outing, then tap Outing. Select the date and time and submit your request. You can check its status in Outing History."
        },
        {
            keywords: ["overnight", "overnight leave", "stay overnight", "bermalam", "cuti bermalam"],
            reply: "Open the Student Portal, choose Outing, then tap Overnight Leave. Select the date and time and submit it for staff review."
        },
        {
            keywords: ["clock in", "return hostel", "back to hostel", "masuk asrama", "balik asrama"],
            reply: "When you return, open the Student Portal, choose Outing, tap Clock In, then enter your return date and time."
        }
    ];

    function matchesKeyword(message, keyword) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
        return pattern.test(message);
    }

    function createTypingIndicator() {
        const indicator = document.createElement("div");
        indicator.className = "typing-indicator";
        indicator.setAttribute("aria-label", "AI is typing");
        indicator.innerHTML = "<span></span><span></span><span></span>";
        return indicator;
    }

    function scrollToLatest(messagesEl) {
        requestAnimationFrame(() => {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        });
    }

    function setRobotState(panel, state) {
        panel.dataset.state = state;
    }

    function appendUserMessage(messagesEl, text) {
        const message = document.createElement("div");
        message.className = "user-message";
        message.textContent = text;
        messagesEl.appendChild(message);
        scrollToLatest(messagesEl);
    }

    function appendAiContainer(messagesEl) {
        const aiMessage = document.createElement("div");
        aiMessage.className = "ai-message";

        const avatar = document.createElement("div");
        avatar.className = "ai-avatar";
        const avatarImage = document.createElement("img");
        avatarImage.src = shmiaImage;
        avatarImage.alt = "shmia";
        avatar.appendChild(avatarImage);

        const response = document.createElement("div");
        response.className = "ai-response";
        response.appendChild(createTypingIndicator());

        aiMessage.appendChild(avatar);
        aiMessage.appendChild(response);
        messagesEl.appendChild(aiMessage);
        scrollToLatest(messagesEl);

        return response;
    }

    function typeResponse(target, text, messagesEl) {
        return new Promise((resolve) => {
            target.textContent = "";
            const cleanText = text && text.trim() ? text.trim() : fallbackMessage;
            let index = 0;
            const speed = cleanText.length > 420 ? 8 : 14;

            function tick() {
                target.textContent = cleanText.slice(0, index);
                scrollToLatest(messagesEl);

                if (index >= cleanText.length) {
                    resolve();
                    return;
                }

                index += 1;
                window.setTimeout(tick, speed);
            }

            tick();
        });
    }

    async function askBackend(message) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        let response;

        try {
            response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message,
                    history: conversationHistory.slice(-12)
                }),
                signal: controller.signal
            });
        } finally {
            window.clearTimeout(timeout);
        }

        if (!response.ok) {
            throw new Error(`Chat request failed with status ${response.status}`);
        }

        const data = await response.json();
        const reply = typeof data.reply === "string" ? data.reply.trim() : "";
        if (!reply) {
            throw new Error("Chat response was empty");
        }
        return reply;
    }

    function findKnownReply(message) {
        const normalized = message.toLowerCase();
        const match = offlineAnswers.find((answer) => {
            return answer.keywords.some((keyword) => matchesKeyword(normalized, keyword));
        });

        if (match) {
            return match.reply;
        }

        if (/\b(hi|hello|hey|hai|salam|assalamualaikum)\b/i.test(normalized)) {
            return "Hi, I'm shmia. I can help with room booking, accounts, duty lookup, complaints, outings, and hostel information. What do you need?";
        }

        return "";
    }

    function createOfflineReply(message) {
        return findKnownReply(message)
            || "I can help with room booking, assignments, roommates, duty lookup, login, registration, passwords, complaints, outings, and hostel information. Ask one specific question and I’ll guide you.";
    }

    async function loadMarkup() {
        const existing = document.querySelector(".hotel-ai-chatbot");
        if (existing) {
            return existing;
        }

        try {
            const response = await fetch(`chatbot.html?v=${assetVersion}`, { cache: "reload" });
            if (!response.ok) {
                throw new Error("Unable to load chatbot component");
            }

            const markup = await response.text();
            const mount = document.createElement("div");
            mount.innerHTML = markup.trim();
            const root = mount.firstElementChild;

            if (!root) {
                throw new Error("Chatbot component markup is empty");
            }

            document.body.appendChild(root);
            root.querySelectorAll('img[src="assets/shmia-chatbot.png"]').forEach((image) => {
                image.src = shmiaImage;
            });
            return root;
        } catch (error) {
            console.error("Chatbot markup load failed:", error);
            return null;
        }
    }

    async function initChatbot() {
        const root = await loadMarkup();
        if (!root) {
            return;
        }

        const panel = root.querySelector(".chatbot-panel");
        const launcher = root.querySelector(".chatbot-launcher");
        const closeButton = root.querySelector(".chatbot-close");
        const form = root.querySelector("#chatbotForm");
        const input = root.querySelector("#chatbotInput");
        const sendButton = root.querySelector(".chatbot-send");
        const messagesEl = root.querySelector("#chatbotMessages");
        const dragHandle = root.querySelector(".chatbot-header");

        if (!panel || !launcher || !closeButton || !form || !input || !sendButton || !messagesEl) {
            return;
        }

        function setChatbotOpen(isOpen) {
            panel.classList.toggle("is-minimized", !isOpen);
            launcher.classList.toggle("is-visible", !isOpen);
            launcher.setAttribute("aria-expanded", String(isOpen));
            root.classList.toggle("is-open", isOpen);
        }

        setChatbotOpen(!document.body.classList.contains("student-portal"));

        function clamp(value, min, max) {
            return Math.min(Math.max(value, min), Math.max(min, max));
        }

        function restorePosition() {
            try {
                const saved = JSON.parse(localStorage.getItem("shmia_chatbot_position") || "null");
                if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
                    root.style.left = `${saved.left}px`;
                    root.style.top = `${saved.top}px`;
                    root.style.right = "auto";
                    root.style.bottom = "auto";
                }
            } catch (error) {
                console.warn("Unable to restore chatbot position", error);
            }
        }

        function makeDraggable(handle) {
            if (!handle) return;
            let drag = null;
            let moved = false;

            handle.addEventListener("pointerdown", event => {
                if (event.button !== undefined && event.button !== 0) return;
                if (event.target.closest(".chatbot-close")) return;
                const rect = root.getBoundingClientRect();
                drag = {
                    pointerId: event.pointerId,
                    offsetX: event.clientX - rect.left,
                    offsetY: event.clientY - rect.top,
                    startX: event.clientX,
                    startY: event.clientY
                };
                moved = false;
                handle.setPointerCapture?.(event.pointerId);
                root.classList.add("is-dragging");
            });

            handle.addEventListener("pointermove", event => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                const width = root.offsetWidth;
                const height = root.offsetHeight;
                const left = clamp(event.clientX - drag.offsetX, 8, window.innerWidth - width - 8);
                const top = clamp(event.clientY - drag.offsetY, 8, window.innerHeight - height - 8);
                if (Math.abs(event.clientX - drag.startX) > 5 || Math.abs(event.clientY - drag.startY) > 5) moved = true;
                root.style.left = `${left}px`;
                root.style.top = `${top}px`;
                root.style.right = "auto";
                root.style.bottom = "auto";
            });

            handle.addEventListener("pointerup", event => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                try {
                    localStorage.setItem("shmia_chatbot_position", JSON.stringify({
                        left: parseFloat(root.style.left),
                        top: parseFloat(root.style.top)
                    }));
                } catch (error) {
                    console.warn("Unable to save chatbot position", error);
                }
                drag = null;
                root.classList.remove("is-dragging");
            });

            handle.addEventListener("click", event => {
                if (moved) {
                    event.preventDefault();
                    event.stopPropagation();
                    moved = false;
                }
            }, true);
        }

        restorePosition();
        makeDraggable(dragHandle);
        makeDraggable(launcher);

        closeButton.addEventListener("click", () => {
            setChatbotOpen(false);
        });

        launcher.addEventListener("click", () => {
            setChatbotOpen(true);
            input.focus();
            scrollToLatest(messagesEl);
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const message = input.value.trim();
            if (!message) {
                return;
            }

            input.value = "";
            input.disabled = true;
            sendButton.disabled = true;

            appendUserMessage(messagesEl, message);
            const responseEl = appendAiContainer(messagesEl);
            setRobotState(panel, "thinking");

            try {
                const reply = findKnownReply(message) || await askBackend(message);

                setRobotState(panel, "typing");
                await typeResponse(responseEl, reply, messagesEl);
                conversationHistory.push({ role: "user", content: message });
                conversationHistory.push({ role: "assistant", content: reply });
            } catch (error) {
                console.error("Chatbot backend unavailable:", error);
                setRobotState(panel, "responding");
                const reply = createOfflineReply(message);
                await typeResponse(responseEl, reply, messagesEl);
                conversationHistory.push({ role: "user", content: message });
                conversationHistory.push({ role: "assistant", content: reply });
            } finally {
                input.disabled = false;
                sendButton.disabled = false;
                input.focus();
                window.setTimeout(() => setRobotState(panel, "idle"), 450);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            initChatbot();
        });
    } else {
        initChatbot();
    }
})();
