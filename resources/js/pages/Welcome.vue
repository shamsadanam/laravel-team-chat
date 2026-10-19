<script setup lang="ts">
import { Head } from "@inertiajs/vue3";
import { useEchoPublic } from "@laravel/echo-vue";
import { onMounted } from "vue";

useEchoPublic("demo", "MessageSent", (e) => {
    console.log("Got a message:", e.text);
});
</script>

<template>
    <Head title="Title from vue">
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
    </Head>
    <div
        class="flex min-h-screen flex-col items-center bg-[#FDFDFC] p-6 text-[#f1f1f1] lg:justify-center lg:p-8 dark:bg-[#0a0a0a]"
    >
        <h1>Check Console.</h1>
    </div>
</template>
