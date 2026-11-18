require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// 1. Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Kết nối MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Đã kết nối MongoDB thành công!');
    await seedInitialStories();
  })
  .catch((err) => console.error('Lỗi kết nối MongoDB:', err));

// 3. Định nghĩa cấu trúc dữ liệu truyện
const storySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    date: { type: String, required: true },
    image: { type: String, required: true },
    content: [{ type: String }],
  },
  { timestamps: true }
);

// Chuyển _id thành id để khớp với giao diện hiện tại
storySchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

const Story = mongoose.model('Story', storySchema);

// Tự động tạo 3 truyện mẫu nếu Database đang trống
async function seedInitialStories() {
  const count = await Story.countDocuments();
  if (count === 0) {
    await Story.insertMany([
      {
        date: 'Sep 03, 2026',
        title: 'After 9 months away on deployment, I came home and found every one of my belongings stuffed into boxes',
        image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=80',
        content: [
          'After nine grueling months overseas, all I could think about on the flight home was sleeping in my own bed and surprising my family.',
          'When I unlocked the front door, the house was strangely quiet. The hallway was lined with sealed cardboard boxes—my uniforms, my books, even the framed photos from my desk.',
          'Before I could process what was happening, footsteps echoed from the kitchen...'
        ],
      },
      {
        date: 'Nov 04, 2026',
        title: '"For four years, my husband told me New York was too dangerous for me to visit. Then I showed up at his hotel"',
        image: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=900&q=80',
        content: [
          'Every other month, my husband packed his suitcase for another week-long conference in Manhattan.',
          'Last Tuesday, a receipt slipped out of his coat pocket while I was sorting the laundry. It was from a boutique hotel overlooking Central Park, booked for two.',
          'Within three hours, I was on a train heading south.'
        ],
      },
      {
        date: 'Sep 08, 2026',
        title: 'A six-year-old adopted daughter was forced to scrub filthy dishes on Christmas while her cousins opened gifts',
        image: 'https://images.unsplash.com/photo-1543589077-47d81606c1bf?auto=format&fit=crop&w=900&q=80',
        content: [
          'The living room sparkled with golden lights, wrapping paper, and laughter. Meanwhile, in the cold kitchen, six-year-old Clara stood on a wooden stool.',
          'Nobody noticed when a tall man in a tailored suit walked past the guests and pushed the kitchen door open.',
          'He stood silently for ten seconds—and then everything in that grand house changed forever.'
        ],
      },
    ]);
    console.log('Đã thêm 3 truyện mẫu vào MongoDB!');
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Dùng bộ nhớ tạm để đẩy ảnh thẳng lên Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function requireAdmin(req, res, next) {
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Sai mật khẩu Admin' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ error: 'Mật khẩu không chính xác' });
});

app.get('/api/stories', async (req, res) => {
  const stories = await Story.find().sort({ createdAt: -1 });
  res.json(stories);
});

app.get('/api/stories/:id', async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(story);
  } catch {
    res.status(404).json({ error: 'Không tìm thấy' });
  }
});

// Upload ảnh lên Cloudinary
app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file ảnh' });

  const stream = cloudinary.uploader.upload_stream(
    { folder: 'newsharbor-covers' },
    (error, result) => {
      if (error) return res.status(500).json({ error: 'Lỗi upload Cloudinary' });
      res.json({ url: result.secure_url });
    }
  );
  stream.end(req.file.buffer);
});

app.post('/api/stories', requireAdmin, async (req, res) => {
  const { title, date, image, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Thiếu dữ liệu' });

  const newStory = await Story.create({
    title: title.trim(),
    date: date || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    image: image || 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80',
    content: Array.isArray(content) ? content : content.split('\n').map((p) => p.trim()).filter(Boolean),
  });
  res.status(201).json(newStory);
});

app.put('/api/stories/:id', requireAdmin, async (req, res) => {
  const { title, date, image, content } = req.body;
  const updated = await Story.findByIdAndUpdate(
    req.params.id,
    {
      title: title.trim(),
      date,
      image,
      content: Array.isArray(content) ? content : content.split('\n').map((p) => p.trim()).filter(Boolean),
    },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(updated);
});

app.delete('/api/stories/:id', requireAdmin, async (req, res) => {
  await Story.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/story/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});