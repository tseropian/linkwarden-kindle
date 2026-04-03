import { config } from "./config.js";

// ── Types reflecting LinkWarden API responses ──────────────────────────

export interface LinkTag {
  id: number;
  name: string;
}

export interface LinkWardenLink {
  id: number;
  name: string;
  type: string;
  description: string;
  url: string;
  textContent: string | null;
  createdAt: string;
  updatedAt: string;
  tags: LinkTag[];
  collection: {
    id: number;
    name: string;
  };
}

interface LinksResponse {
  response: LinkWardenLink[];
}

interface TagsResponse {
  response: LinkTag[];
}

// ── Client ─────────────────────────────────────────────────────────────

export class LinkWardenClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    this.baseUrl = `${config.linkwarden.url}/api/v1`;
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.linkwarden.accessToken}`,
    };
  }

  /**
   * Fetch all links tagged with the configured "kindle" tag.
   */
  async getLinksByTag(tagId?: number): Promise<LinkWardenLink[]> {
    const id = tagId ?? config.linkwarden.tagId;
    const url = `${this.baseUrl}/links?tagId=${id}`;

    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      throw new Error(
        `LinkWarden API error: ${res.status} ${res.statusText}`
      );
    }

    const data = (await res.json()) as LinksResponse;
    return data.response;
  }

  /**
   * Fetch a single link by ID (includes textContent for readable view).
   */
  async getLink(linkId: number): Promise<LinkWardenLink> {
    const url = `${this.baseUrl}/links/${linkId}`;

    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      throw new Error(
        `LinkWarden API error fetching link ${linkId}: ${res.status}`
      );
    }

    const data = (await res.json()) as { response: LinkWardenLink };
    return data.response;
  }

  /**
   * Fetch all tags to resolve tag names ↔ IDs.
   */
  async getTags(): Promise<LinkTag[]> {
    const url = `${this.baseUrl}/tags`;

    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      throw new Error(`LinkWarden API error fetching tags: ${res.status}`);
    }

    const data = (await res.json()) as TagsResponse;
    return data.response;
  }

  /**
   * Update a link's tags (used to mark articles as sent).
   * We add the "kindle-sent" tag while preserving existing tags.
   */
  async addTagToLink(linkId: number, tagName: string): Promise<void> {
    const link = await this.getLink(linkId);
    const existingTags = link.tags.map((t) => ({
      id: t.id,
      name: t.name,
    }));

    // Don't add duplicate
    if (existingTags.some((t) => t.name === tagName)) return;

    // Check if the tag exists, if not create it first
    const allTags = await this.getTags();
    let targetTag = allTags.find((t) => t.name === tagName);

    if (!targetTag) {
      // Create the tag first
      await this.createTag(tagName);
      // Refresh the tags list to get the new tag ID
      const updatedTags = await this.getTags();
      targetTag = updatedTags.find((t) => t.name === tagName);
      if (!targetTag) {
        throw new Error(`Failed to create or find tag: ${tagName}`);
      }
    }

    const url = `${this.baseUrl}/links/${linkId}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({
        id: link.id,
        name: link.name,
        url: link.url,
        description: link.description,
        type: link.type,
        tags: [...existingTags, { id: targetTag.id, name: targetTag.name }],
        collection: link.collection,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `LinkWarden API error updating link ${linkId}: ${res.status} ${errorText}`
      );
    }
  }

  /**
   * Create a new tag.
   */
  async createTag(tagName: string): Promise<void> {
    const url = `${this.baseUrl}/tags`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        tags: [{ label: tagName }],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `LinkWarden API error creating tag ${tagName}: ${res.status} ${errorText}`
      );
    }
  }

  /**
   * Get links tagged "kindle" but NOT tagged "kindle-sent".
   */
  async getUnsentLinks(): Promise<LinkWardenLink[]> {
    const links = await this.getLinksByTag();

    return links.filter(
      (link) =>
        !link.tags.some((t) => t.name === config.linkwarden.sentTagName)
    );
  }
}
