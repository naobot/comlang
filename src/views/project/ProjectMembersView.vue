<script setup lang="ts">
import ProjectMembers from "@/components/ProjectMembers.vue";

defineProps<{ projectId: string }>();
</script>

<template>
  <ProjectMembers :project-id="projectId" />
</template>
