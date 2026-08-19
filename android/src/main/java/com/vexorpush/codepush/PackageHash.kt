package com.vexorpush.codepush

import java.io.File
import java.security.MessageDigest
import java.util.zip.ZipFile

/**
 * Recomputes the CodePush package hash so a downloaded bundle can be checked
 * against the hash the server published for it.
 *
 * The hash is taken over the archive entries rather than the extracted files.
 * The server hashes paths relative to its unzip directory, which are exactly
 * the paths stored in the archive; the client renames the extracted folder, so
 * hashing what landed on disk would produce different paths and never match.
 * Working from the archive also means a tampered package is rejected before
 * anything is written to disk.
 *
 * The digest must match packageHashSync on the server byte for byte: a JSON
 * array of "path:sha256" strings, sorted as whole strings, no separators,
 * hashed with SHA-256.
 */
object PackageHash {

  private const val IGNORE_MACOSX = "__MACOSX/"
  private const val IGNORE_DS_STORE = ".DS_Store"
  private const val IGNORE_CODEPUSH_METADATA = ".codepushrelease"

  /** Files the server leaves out of the manifest entirely. */
  private fun isHashIgnored(relativePath: String): Boolean =
    relativePath.isEmpty() ||
      relativePath.startsWith(IGNORE_MACOSX) ||
      relativePath == IGNORE_DS_STORE ||
      relativePath.endsWith(IGNORE_DS_STORE)

  /** Additionally left out of the hash, though it stays in the manifest. */
  private fun isPackageHashIgnored(relativePath: String): Boolean =
    relativePath == IGNORE_CODEPUSH_METADATA ||
      relativePath.endsWith(IGNORE_CODEPUSH_METADATA) ||
      isHashIgnored(relativePath)

  fun computeFromZip(zipFile: File): String {
    val entries = mutableListOf<String>()

    ZipFile(zipFile).use { zip ->
      for (entry in zip.entries().asSequence().filter { !it.isDirectory }) {
        // Zip entries always use forward slashes, which is what the server
        // normalises to, so no path rewriting is needed here.
        val relativePath = entry.name
        if (isPackageHashIgnored(relativePath)) continue

        val digest = MessageDigest.getInstance("SHA-256")
        zip.getInputStream(entry).use { input ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            digest.update(buffer, 0, read)
          }
        }
        entries.add(relativePath + ":" + digest.digest().toHex())
      }
    }

    entries.sort()
    return sha256Hex(jsonStringArray(entries))
  }

  /**
   * Mirrors JSON.stringify for an array of strings: no whitespace, same escape
   * set. Bundle paths are plain ASCII in practice, but the digest would quietly
   * diverge on anything else.
   */
  private fun jsonStringArray(values: List<String>): String {
    val builder = StringBuilder()
    builder.append('[')
    values.forEachIndexed { index, value ->
      if (index > 0) builder.append(',')
      builder.append('"')
      for (char in value) {
        when {
          char == '"' -> builder.append("\\\"")
          char == '\\' -> builder.append("\\\\")
          char == '\b' -> builder.append("\\b")
          char == '\u000C' -> builder.append("\\f")
          char == '\n' -> builder.append("\\n")
          char == '\r' -> builder.append("\\r")
          char == '\t' -> builder.append("\\t")
          char < ' ' -> builder.append(String.format("\\u%04x", char.code))
          else -> builder.append(char)
        }
      }
      builder.append('"')
    }
    builder.append(']')
    return builder.toString()
  }

  private fun sha256Hex(value: String): String =
    MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).toHex()

  private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
