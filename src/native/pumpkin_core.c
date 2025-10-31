#include "pumpkin_core.h"
#include "stb_image.h"
#include <stdlib.h>
#include <string.h>

void pumpkin_destroy(pumpkin_t *p) {
  if (!p)
    return;
  free(p->pixels);
  memset(p, 0, sizeof(*p));
}

bool pumpkin_init(pumpkin_t *p, const uint8_t *rgba, uint32_t width,
                  uint32_t height, uint32_t channels) {
  if (!p || !rgba || channels != 4) {
    return false;
  }

  if (p->pixels) {
    pumpkin_destroy(p);
  }

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

  uint32_t max_x = search_width - p->width;
  uint32_t max_y = search_height - p->height;

  for (uint32_t sy = 0; sy <= max_y; sy++) {
    for (uint32_t sx = 0; sx <= max_x; sx++) {
      bool matched = true;

      for (size_t i = 0; i < p->pixel_count; i++) {
        const sample_pixel_t *s = &p->pixels[i];
        size_t idx =
            (((size_t)sy + s->dy) * search_width + ((size_t)sx + s->dx)) *
            channels;
        const uint8_t *cand = &search[idx];
        if (cand[0] != s->rgba[0] || cand[1] != s->rgba[1] ||
            cand[2] != s->rgba[2] || cand[3] != s->rgba[3]) {
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
