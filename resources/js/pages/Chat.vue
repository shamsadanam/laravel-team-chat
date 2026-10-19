<script setup lang="ts">
import { Head } from "@inertiajs/vue3";

console.log("This is chat page");
</script>

<template>
    <Head title="Chatroom">
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
    </Head>
    <div
        class="flex min-h-screen flex-col items-center bg-[#FDFDFC] p-6 text-[#f1f1f1] lg:justify-center lg:p-8 dark:bg-[#0a0a0a]"
    >
        <h1>Chat Room</h1>
    </div>
</template>
