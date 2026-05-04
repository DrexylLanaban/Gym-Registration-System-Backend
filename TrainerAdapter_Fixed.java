package com.example.gymregistrationsystem.adapters;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;
import com.example.gymregistrationsystem.R;
import com.example.gymregistrationsystem.api.RetrofitClient;
import com.example.gymregistrationsystem.models.Trainer;
import com.example.gymregistrationsystem.utils.SessionManager;

import java.util.List;

public class TrainerAdapter extends RecyclerView.Adapter<TrainerAdapter.TrainerViewHolder> {

    private List<Trainer> trainers;
    private OnTrainerClickListener listener;

    public interface OnTrainerClickListener {
        void onTrainerClick(Trainer trainer);
    }

    public TrainerAdapter(List<Trainer> trainers, OnTrainerClickListener listener) {
        this.trainers = trainers;
        this.listener = listener;
    }

    @NonNull
    @Override
    public TrainerViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_trainer, parent, false);
        return new TrainerViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull TrainerViewHolder holder, int position) {
        Trainer trainer = trainers.get(position);
        holder.tvName.setText(trainer.getFullName().toUpperCase());
        holder.tvSpecialization.setText(trainer.getSpecialization());
        holder.tvDescription.setText(trainer.getDescription());
        holder.tvMemberCount.setText(trainer.getMemberCount() + " FOLLOWERS");

        boolean isAvailable = "active".equalsIgnoreCase(trainer.getStatus());
        holder.tvStatusLabel.setText(isAvailable ? "AVAILABLE" : "UNAVAILABLE");
        holder.tvStatusLabel.setTextColor(isAvailable ? Color.GREEN : Color.RED);
        holder.viewStatusIndicator.setBackgroundColor(isAvailable ? Color.GREEN : Color.RED);

        holder.btnBook.setEnabled(isAvailable);
        holder.btnBook.setAlpha(isAvailable ? 1.0f : 0.5f);
        holder.btnBook.setOnClickListener(v -> {
            if (isAvailable) {
                String phone = trainer.getPhone();
                if (phone == null || phone.isEmpty()) phone = "09123456789";
                Intent intent = new Intent(Intent.ACTION_DIAL);
                intent.setData(Uri.parse("tel:" + phone));
                holder.itemView.getContext().startActivity(intent);
            }
        });

        SessionManager session = SessionManager.getInstance(holder.itemView.getContext());
        holder.btnBook.setVisibility((session.isAdmin() || session.isStaff()) ? View.GONE : View.VISIBLE);

        // DEBUG: Log all image data
        Log.d("TrainerAdapter", "=== Trainer Image Debug ===");
        Log.d("TrainerAdapter", "Trainer Name: " + trainer.getFullName());
        Log.d("TrainerAdapter", "Profile Photo: " + trainer.getProfilePhoto());
        Log.d("TrainerAdapter", "Image URL: " + trainer.getImageUrl());
        Log.d("TrainerAdapter", "Display Image: " + trainer.getDisplayImage());

        // Load profile photo with multiple fallback strategies
        loadTrainerImage(trainer, holder.ivPhoto);
        
        holder.itemView.setOnClickListener(v -> listener.onTrainerClick(trainer));
    }

    private void loadTrainerImage(Trainer trainer, ImageView imageView) {
        String photoUrl = trainer.getDisplayImage();
        
        if (photoUrl != null && !photoUrl.trim().isEmpty()) {
            Log.d("TrainerAdapter", "Attempting to load image: " + photoUrl.substring(0, Math.min(50, photoUrl.length())) + "...");
            
            if (photoUrl.startsWith("data:image/")) {
                // Try multiple methods for base64 images
                if (!loadBase64WithGlide(photoUrl, imageView)) {
                    if (!loadBase64Manually(photoUrl, imageView)) {
                        // Fallback to placeholder
                        loadPlaceholder(imageView);
                    }
                }
            } else {
                // Handle regular URLs
                String fullUrl = RetrofitClient.getFullImageUrl(photoUrl);
                Log.d("TrainerAdapter", "Loading regular URL: " + fullUrl);
                Glide.with(imageView.getContext())
                        .load(fullUrl != null ? fullUrl : R.drawable.ic_avatar_placeholder)
                        .circleCrop()
                        .placeholder(R.drawable.ic_avatar_placeholder)
                        .error(R.drawable.ic_avatar_placeholder)
                        .into(imageView);
            }
        } else {
            Log.d("TrainerAdapter", "No photo URL available, using placeholder");
            loadPlaceholder(imageView);
        }
    }

    private boolean loadBase64WithGlide(String base64String, ImageView imageView) {
        try {
            Glide.with(imageView.getContext())
                    .load(base64String)
                    .circleCrop()
                    .placeholder(R.drawable.ic_avatar_placeholder)
                    .error(R.drawable.ic_avatar_placeholder)
                    .into(imageView);
            Log.d("TrainerAdapter", "Glide base64 loading initiated");
            return true;
        } catch (Exception e) {
            Log.e("TrainerAdapter", "Glide base64 failed: " + e.getMessage());
            return false;
        }
    }

    private boolean loadBase64Manually(String base64String, ImageView imageView) {
        try {
            // Extract the base64 part
            String base64Image;
            if (base64String.contains(",")) {
                base64Image = base64String.split(",")[1];
            } else {
                base64Image = base64String;
            }
            
            Log.d("TrainerAdapter", "Base64 length: " + base64Image.length());
            
            // Decode base64 to byte array
            byte[] decodedString = Base64.decode(base64Image, Base64.DEFAULT);
            
            // Convert to bitmap
            Bitmap bitmap = BitmapFactory.decodeByteArray(decodedString, 0, decodedString.length);
            
            if (bitmap != null) {
                Log.d("TrainerAdapter", "Bitmap decoded successfully: " + bitmap.getWidth() + "x" + bitmap.getHeight());
                imageView.setImageBitmap(bitmap);
                return true;
            } else {
                Log.e("TrainerAdapter", "Bitmap decode returned null");
            }
        } catch (Exception e) {
            Log.e("TrainerAdapter", "Manual base64 decode failed: " + e.getMessage());
        }
        return false;
    }

    private void loadPlaceholder(ImageView imageView) {
        Log.d("TrainerAdapter", "Loading placeholder image");
        Glide.with(imageView.getContext())
                .load(R.drawable.ic_avatar_placeholder)
                .circleCrop()
                .into(imageView);
    }

    @Override
    public int getItemCount() {
        return trainers.size();
    }

    static class TrainerViewHolder extends RecyclerView.ViewHolder {
        TextView tvName, tvSpecialization, tvDescription, tvMemberCount, tvStatusLabel;
        ImageView ivPhoto;
        View viewStatusIndicator;
        Button btnBook;

        public TrainerViewHolder(@NonNull View itemView) {
            super(itemView);
            tvName = itemView.findViewById(R.id.tvTrainerName);
            tvSpecialization = itemView.findViewById(R.id.tvSpecialization);
            tvDescription = itemView.findViewById(R.id.tvDescription);
            tvMemberCount = itemView.findViewById(R.id.tvMemberCount);
            tvStatusLabel = itemView.findViewById(R.id.tvStatusLabel);
            ivPhoto = itemView.findViewById(R.id.ivTrainerPhoto);
            viewStatusIndicator = itemView.findViewById(R.id.viewStatusIndicator);
            btnBook = itemView.findViewById(R.id.btnBookSession);
        }
    }
}
