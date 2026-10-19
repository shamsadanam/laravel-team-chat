import { createInertiaApp } from "@inertiajs/vue3";
import { configureEcho } from "@laravel/echo-vue";

configureEcho({
    broadcaster: "reverb",
});

const appName = import.meta.env.VITE_APP_NAME || "Laravel";

void createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    withApp: (app) => {
        app.directive("focus", {
            mounted: (el: HTMLElement, shouldFocus) => {
                if (shouldFocus.value !== false) {
                    el.focus();
                }

                window.Echo.channel("demo").listen("MessageSent", (e) => {
                    console.log("Got a message:", e.text);
                });
            },
        });
    },
    progress: {
        color: "#4B5563",
    },
});
