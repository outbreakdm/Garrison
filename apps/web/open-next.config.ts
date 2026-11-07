import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/** Garrison's dashboard on Cloudflare Workers. No caches are configured: every page is dynamic. */
export default defineCloudflareConfig();
