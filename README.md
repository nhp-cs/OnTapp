# OnTap — Web ôn tập thi trắc nghiệm

Tính năng:
- Người dùng: chỉ nhập **tên** → làm bài → nộp bài → xem điểm + xem đúng/sai + đáp án.
- Admin: **import đề bằng văn bản** (dễ tính) → preview → lưu vào **localStorage** (trên thiết bị này) hoặc export JSON.
- Deploy miễn phí: chạy tốt trên **GitHub Pages** (static site).

## Chạy thử local

> Mở trực tiếp `index.html` bằng `file://` có thể bị lỗi `fetch` với `data/exams.json` (tuỳ trình duyệt).

Chạy bằng server tĩnh:

```powershell
python -m http.server 5173
```

Sau đó mở:
- `http://localhost:5173/index.html`
- `http://localhost:5173/admin.html`

## Deploy GitHub Pages (miễn phí)

1. Push repo lên GitHub.
2. Vào **Settings → Pages**.
3. Chọn **Deploy from a branch**.
4. Chọn branch (ví dụ `main`) và thư mục `/ (root)`.
5. Save → đợi GitHub build → truy cập URL Pages.

## Import đề thi (admin)

Mở `admin.html`, dán đề theo format:

```
# Tiêu đề (tuỳ chọn)

Q: Câu hỏi?
A) Lựa chọn A
B) Lựa chọn B
C) Lựa chọn C
ANSWER: B
GIẢI THÍCH: ...
```

Hoặc đánh dấu đáp án đúng bằng `*`:

```
Q: 1 + 1 = ?
A) 1
*B) 2
C) 3
```

## Publish đề cho tất cả người dùng

GitHub Pages là static, nên để tất cả người dùng thấy đề:
- Export JSON từ trang admin
- Thêm đề vào `data/exams.json`
- Commit & push lên GitHub
