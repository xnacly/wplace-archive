#include "pumpkin_core.h"
#include <emmintrin.h>
#include <stdlib.h>
#include <string.h>

void pumpkin_destroy(pumpkin_t *p) {
  if (!p || !p->rows)
    return;

  for (uint32_t y = 0; y < p->height; y++) {
    free(p->rows[y].rgba);
    free(p->rows[y].dx);
  }

  free(p->rows);

  // optional: zero out the struct to avoid dangling pointers
  p->rows = NULL;
  p->height = 0;
  p->width = 0;
  p->first_pixel_dx = 0;
  p->first_pixel_dy = 0;
}

bool pumpkin_init(pumpkin_t *p, const uint8_t *rgba, uint32_t width,
                  uint32_t height, uint32_t channels) {
  if (!p || !rgba || channels != 4 || width == 0 || height == 0)
    return false;

  pumpkin_destroy(p);

  p->rows = calloc(height, sizeof(pumpkin_row_t));
  if (!p->rows)
    return false;

  bool first_found = false;
  for (uint32_t y = 0; y < height; y++) {
    size_t row_count = 0;
    // first pass: count opaque pixels
    for (uint32_t x = 0; x < width; x++) {
      size_t idx = ((size_t)y * width + x) * channels;
      if (rgba[idx + 3] == 255)
        row_count++;
    }

    if (row_count == 0)
      continue;

    p->rows[y].rgba = malloc(row_count * sizeof(uint32_t));
    p->rows[y].dx = malloc(row_count * sizeof(uint16_t));
    if (!p->rows[y].rgba || !p->rows[y].dx) {
      pumpkin_destroy(p);
      return false;
    }

    size_t w = 0;
    for (uint32_t x = 0; x < width; x++) {
      size_t idx = ((size_t)y * width + x) * channels;
      if (rgba[idx + 3] == 255) {
        p->rows[y].dx[w] = x;
        p->rows[y].rgba[w] = *(uint32_t *)&rgba[idx];

        if (!first_found) {
          p->first_pixel_dx = x;
          p->first_pixel_dy = y;
          first_found = true;
        }
        w++;
      }
    }
    p->rows[y].count = w;
  }

  p->height = height;
  p->width = width;

  return true;
}

bool pumpkin_find(const pumpkin_t *p, const uint8_t *search,
                  uint32_t search_width, uint32_t search_height,
                  uint32_t channels, uint32_t *out_x, uint32_t *out_y) {
  if (!p || !p->rows || !search)
    return false;
  if (channels != 4 || search_width < p->width || search_height < p->height)
    return false;

  uint32_t max_x = search_width - p->width;
  uint32_t max_y = search_height - p->height;

  for (uint32_t sy = 0; sy <= max_y; sy++) {
    for (uint32_t sx = 0; sx <= max_x; sx++) {
      bool matched = true;

      for (uint32_t ry = 0; ry < p->height; ry++) {
        pumpkin_row_t row = p->rows[ry];
        size_t i = 0;

        // process 4 pixels at a time
        for (; i + 3 < row.count; i += 4) {
          uint32_t idx0 = ((size_t)sy + ry) * search_width + sx + row.dx[i + 0];
          uint32_t idx1 = ((size_t)sy + ry) * search_width + sx + row.dx[i + 1];
          uint32_t idx2 = ((size_t)sy + ry) * search_width + sx + row.dx[i + 2];
          uint32_t idx3 = ((size_t)sy + ry) * search_width + sx + row.dx[i + 3];

          idx0 *= channels;
          idx1 *= channels;
          idx2 *= channels;
          idx3 *= channels;

          __m128i cand = _mm_set_epi32(
              *(uint32_t *)&search[idx3], *(uint32_t *)&search[idx2],
              *(uint32_t *)&search[idx1], *(uint32_t *)&search[idx0]);

          __m128i pumpkin = _mm_set_epi32(row.rgba[i + 3], row.rgba[i + 2],
                                          row.rgba[i + 1], row.rgba[i + 0]);

          __m128i cmp = _mm_cmpeq_epi32(cand, pumpkin);
          int mask = _mm_movemask_epi8(cmp);

          if (mask != 0xFFFF) { // not all 4 pixels match
            matched = false;
            break;
          }
        }

        // handle remaining pixels
        for (; i < row.count; i++) {
          size_t idx = ((size_t)sy + ry) * search_width + sx + row.dx[i];
          idx *= channels;
          if (*(uint32_t *)&search[idx] != row.rgba[i]) {
            matched = false;
            break;
          }
        }

        if (!matched)
          break;
      }

      if (matched) {
        if (out_x)
          *out_x = sx + p->first_pixel_dx;
        if (out_y)
          *out_y = sy + p->first_pixel_dy;
        return true;
      }
    }
  }
  return false;
}
