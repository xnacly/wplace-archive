#include "pumpkin_core.h"
#include <stdlib.h>
#include <string.h>

void pumpkin_destroy(pumpkin_t *p) {
  if (!p)
    return;
  free(p->pixels);
}

bool pumpkin_init(pumpkin_t *p, const uint8_t *rgba, uint32_t width,
                  uint32_t height, uint32_t channels) {
  if (!p || !rgba || channels != 4) {
    return false;
  }

  if (width == 0 || height == 0) {
    return false;
  }

  // check for overflows
  uint64_t total = (uint64_t)width * (uint64_t)height * (uint64_t)channels;
  if (total > SIZE_MAX) {
    return false;
  }

  pumpkin_destroy(p);

  size_t count = 0;
  uint16_t first_dx = 0, first_dy = 0;
  bool first_found = false;

  for (uint32_t y = 0; y < height; y++) {
    for (uint32_t x = 0; x < width; x++) {
      size_t idx = ((size_t)y * width + x) * channels;
      if (rgba[idx + 3] == 255) {
        if (!first_found) {
          first_dx = x;
          first_dy = y;
          first_found = true;
        }
        count++;
      }
    }
  }

  if (count == 0) {
    return false;
  }

  sample_pixel_t *pixels = malloc(sizeof(sample_pixel_t) * count);
  if (!pixels) {
    return false;
  }

  size_t w = 0;
  for (uint32_t y = 0; y < height; y++) {
    for (uint32_t x = 0; x < width; x++) {
      size_t idx = ((size_t)y * width + x) * channels;
      if (rgba[idx + 3] == 255) {
        sample_pixel_t *s = &pixels[w++];
        s->dx = (uint16_t)x;
        s->dy = (uint16_t)y;
        memcpy(s->rgba, &rgba[idx], 4);
      }
    }
  }

  p->pixels = pixels;
  p->pixel_count = count;
  p->width = width;
  p->height = height;
  p->channels = channels;
  p->first_pixel_dx = first_dx;
  p->first_pixel_dy = first_dy;

  return true;
}

bool pumpkin_find(const pumpkin_t *p, const uint8_t *search,
                  uint32_t search_width, uint32_t search_height,
                  uint32_t channels, uint32_t *out_x, uint32_t *out_y) {
  if (!p || !p->pixels || !search) {
    return false;
  }
  if (channels != 4) {
    return false;
  }
  if (search_width < p->width || search_height < p->height) {
    return false;
  }
  if (p->pixel_count == 0) {
    return false;
  }

  // 1. skip bad candidates before doing full scan.
  // 2. merging rgba[4] into uint32_t results in very fast comparisons
  // 3. early return: skip rest on first mismatch
  // 4. do less work per loop

  uint32_t max_x = search_width - p->width;
  uint32_t max_y = search_height - p->height;

  // prefiltering here
  const sample_pixel_t first_pixel = p->pixels[0];
  // this treats rgba as a single 32bit integer
  uint32_t first_pixel_val = *(uint32_t *)first_pixel.rgba;

  for (uint32_t sy = 0; sy <= max_y; sy++) {
    for (uint32_t sx = 0; sx <= max_x; sx++) {

      // apply prefilter from before here
      size_t idx0 = ((size_t)sy + first_pixel.dy) * search_width +
                    ((size_t)sx + first_pixel.dx);
      idx0 *= channels;
      uint32_t cand_val = *(uint32_t *)&search[idx0];

      // reject filtered out candidates
      if (cand_val != first_pixel_val) {
        continue;
      }

      bool matched = true;
      for (size_t i = 1; i < p->pixel_count; i++) {
        const sample_pixel_t *s = &p->pixels[i];
        size_t idx = ((size_t)sy + s->dy) * search_width + ((size_t)sx + s->dx);
        idx *= channels;

        // again treat rgba[4] as a single 32bit integer, its faster
        uint32_t search_val = *(uint32_t *)&search[idx];
        uint32_t pumpkin_val = *(uint32_t *)s->rgba;
        if (search_val != pumpkin_val) {
          matched = false;
          break;
        }
      }

      if (matched) {
        if (out_x) {
          *out_x = sx + p->first_pixel_dx;
        }
        if (out_y) {
          *out_y = sy + p->first_pixel_dy;
        }
        return true;
      }
    }
  }

  return false;
}
