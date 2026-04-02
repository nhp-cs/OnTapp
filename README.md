# OnTap — Web ôn tập thi trắc nghiệm

Tính năng:
- Người dùng: nhập **tên** → làm bài → nộp bài → xem điểm + xem đúng/sai + xem đáp án.
- Admin: import đề bằng văn bản → preview → lưu vào máy (localStorage) hoặc export JSON.
- Deploy miễn phí: chạy tốt trên **GitHub Pages** (static site).

## Chạy thử local

Mở trực tiếp `index.html` bằng `file://` đôi khi bị lỗi `fetch` với `data/exams.json`.
Nên chạy bằng server tĩnh:

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
5. Đợi GitHub build xong và mở URL Pages.

## Lịch sử lượt thi (để Zalo/Chrome/máy khác đều ghi được)

Mặc định lịch sử lượt thi lưu bằng `localStorage`, nên mỗi trình duyệt/mỗi máy sẽ **không thấy chung**.
Nếu muốn **ai mở link cũng ghi lịch sử**, hãy dùng Supabase (free tier).

### 1) Tạo bảng `attempts`

Supabase → SQL Editor, chạy:

```sql
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  exam_id text not null,
  exam_title text not null,
  name text not null,
  correct int not null,
  total int not null,
  pct int not null,
  duration_sec int,
  started_at timestamptz,
  submitted_at timestamptz,
  source text
);

alter table public.attempts enable row level security;

-- Cho phép ghi (INSERT) từ người dùng không đăng nhập
create policy if not exists attempts_insert_anon
on public.attempts
for insert
to anon
with check (true);

-- Cho phép đọc (SELECT) để trang admin xem thống kê.
-- Lưu ý: ai có anon key cũng có thể đọc dữ liệu.
create policy if not exists attempts_select_anon
on public.attempts
for select
to anon
using (true);
```

### 2) Lấy URL + anon key

Supabase → Project Settings → API:
- `Project URL`
- `anon public key`

### 3) Bật cho TẤT CẢ người dùng (quan trọng)

Điền 2 giá trị vào file `data/backend.json`, rồi commit & push:

```json
{
  "url": "https://xxxx.supabase.co",
  "anonKey": "eyJ..."
}
```

Sau khi deploy lại, bất kỳ ai mở bài (kể cả mở qua Zalo) cũng sẽ ghi lịch sử lên Supabase.

> Không dùng `service_role key` trong web tĩnh.

## Import đề thi (admin)

Mở `admin.html`, dán đề theo format:

```
Câu hỏi 1 ...
A. ...
B. ...
C. ...
D. ...

Câu hỏi 2 ...
A. ...
B. ...
C. ...

ĐÁP ÁN
B
C
```

## Publish đề cho tất cả người dùng

GitHub Pages là static, nên để mọi người thấy đề mới:
- Export JSON từ trang admin
- Thêm đề vào `data/exams.json`
- Commit & push lên GitHub
