/**
 * Aho-Corasick Automaton — tìm NHIỀU pattern trong 1 văn bản cùng lúc, quét
 * văn bản đúng 1 lượt duy nhất (O(độ dài văn bản + số kết quả khớp)).
 *
 * Dùng để nhận diện tên phim/tên rạp được nhắc tới trong câu chat — thay cho
 * cách cũ là lặp qua từng phim một rồi gọi `.includes()` (O(số phim × độ dài
 * câu)). Với danh sách phim/rạp lớn, Aho-Corasick nhanh hơn rõ rệt vì chỉ
 * dựng automaton 1 lần (khi cache phim/rạp refresh) rồi tái sử dụng cho mọi
 * câu chat sau đó.
 *
 * Cấu trúc chuẩn: Trie + failure link (giống thuật toán KMP nhưng cho nhiều
 * pattern), build theo BFS.
 */

class AhoCorasickNode {
  constructor() {
    this.children = new Map() // ký tự → node con
    this.fail = null          // failure link
    this.output = []          // chỉ số các pattern KẾT THÚC tại node này (gồm cả pattern là hậu tố của pattern khác)
  }
}

class AhoCorasick {
  /** @param {string[]} patterns - danh sách chuỗi cần tìm (nên đã chuẩn hoá chữ thường) */
  constructor(patterns) {
    this.patterns = patterns
    this.root = new AhoCorasickNode()
    this._buildTrie()
    this._buildFailureLinks()
  }

  _buildTrie() {
    this.patterns.forEach((pattern, idx) => {
      let node = this.root
      for (const ch of pattern) {
        if (!node.children.has(ch)) node.children.set(ch, new AhoCorasickNode())
        node = node.children.get(ch)
      }
      node.output.push(idx)
    })
  }

  // BFS để gán failure link cho từng node — phần lõi biến Trie thành "automaton"
  _buildFailureLinks() {
    const queue = []
    for (const child of this.root.children.values()) {
      child.fail = this.root
      queue.push(child)
    }
    while (queue.length) {
      const current = queue.shift()
      for (const [ch, child] of current.children) {
        queue.push(child)
        let f = current.fail
        while (f && !f.children.has(ch)) f = f.fail
        child.fail = f ? f.children.get(ch) : this.root
        // Gộp output của failure link (1 pattern có thể là hậu tố của pattern khác)
        if (child.fail.output.length) child.output = child.output.concat(child.fail.output)
      }
    }
  }

  /**
   * Quét văn bản 1 lượt, trả về TẤT CẢ vị trí mà 1 pattern bất kỳ khớp.
   * @returns {Array<{patternIndex:number, endIndex:number}>}
   */
  search(text) {
    const matches = []
    let node = this.root
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      while (node !== this.root && !node.children.has(ch)) node = node.fail
      node = node.children.has(ch) ? node.children.get(ch) : this.root
      for (const patternIndex of node.output) {
        matches.push({ patternIndex, endIndex: i })
      }
    }
    return matches
  }
}

module.exports = { AhoCorasick }
