/**
 * Vite dev plugin — exposes POST /api/save-room for writing room template
 * JSON back to disk. Dev-only: stripped from production builds automatically
 * (Vite plugins only run in dev/build).
 *
 * Adapted from agd/builder/vite_plugin.ts — this variant targets
 * `assets/rooms/` and uses `roomId` instead of `mapId` to reflect Into the
 * Rift's room-template data model.
 */
import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

export function roomSavePlugin(): Plugin {
  let projectRoot = '';

  return {
    name: 'room-save',
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      // Return a function so middleware is added AFTER Vite's internal
      // middleware. This avoids Vite's transform pipeline intercepting the
      // request.
      return () => {
        server.middlewares.use((req, res, next) => {
          if (req.url !== '/api/save-room' || req.method !== 'POST') {
            next();
            return;
          }

          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString('utf-8');
              const { roomId, data } = JSON.parse(body);

              if (!roomId || !data) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing roomId or data' }));
                return;
              }

              // Sanitize roomId — only allow alphanumeric, underscore, hyphen
              if (!/^[\w-]+$/.test(roomId)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid roomId' }));
                return;
              }

              const roomsDir = path.resolve(projectRoot, 'assets/rooms');
              const roomPath = path.join(roomsDir, `${roomId}.json`);

              // Safety: ensure path is within assets/rooms/
              if (!roomPath.startsWith(roomsDir)) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Path traversal blocked' }));
                return;
              }

              // Ensure the target directory exists (first save may create it)
              fs.mkdirSync(roomsDir, { recursive: true });

              const jsonStr = JSON.stringify(data, null, 2);
              fs.writeFileSync(roomPath, jsonStr);
              const sizeKB = (jsonStr.length / 1024).toFixed(1);
              console.log(
                `[room-save] Saved ${roomId}.json (${sizeKB}KB) to ${roomPath}`,
              );

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, path: roomPath, sizeKB }));
            } catch (e) {
              console.error('[room-save] Error:', e);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });
        });
      };
    },
  };
}
