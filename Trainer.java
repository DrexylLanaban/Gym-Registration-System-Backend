package com.example.gymregistrationsystem.models;

import com.google.gson.annotations.SerializedName;

public class Trainer {
    @SerializedName("id")
    private int id;

    @SerializedName("full_name")
    private String fullName;

    @SerializedName("first_name")
    private String firstName;

    @SerializedName("last_name")
    private String lastName;

    @SerializedName("phone")
    private String phone;

    @SerializedName("email")
    private String email;

    @SerializedName("specialization")
    private String specialization;

    @SerializedName("description")
    private String description;

    @SerializedName("status")
    private String status;

    @SerializedName("member_count")
    private int memberCount;

    @SerializedName("profile_photo")
    private String profilePhoto;

    @SerializedName("image_url")
    private String imageUrl;

    @SerializedName("created_at")
    private String createdAt;

    @SerializedName("updated_at")
    private String updatedAt;

    // Constructors
    public Trainer() {}

    public Trainer(int id, String fullName, String specialization) {
        this.id = id;
        this.fullName = fullName;
        this.specialization = specialization;
    }

    // Getters
    public int getId() { return id; }
    public String getFullName() { return fullName; }
    public String getFirstName() { return firstName; }
    public String getLastName() { return lastName; }
    public String getPhone() { return phone; }
    public String getEmail() { return email; }
    public String getSpecialization() { return specialization; }
    public String getDescription() { return description; }
    public String getStatus() { return status; }
    public int getMemberCount() { return memberCount; }
    public String getProfilePhoto() { return profilePhoto; }
    public String getImageUrl() { return imageUrl; }
    public String getCreatedAt() { return createdAt; }
    public String getUpdatedAt() { return updatedAt; }

    // Setters
    public void setId(int id) { this.id = id; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    public void setPhone(String phone) { this.phone = phone; }
    public void setEmail(String email) { this.email = email; }
    public void setSpecialization(String specialization) { this.specialization = specialization; }
    public void setDescription(String description) { this.description = description; }
    public void setStatus(String status) { this.status = status; }
    public void setMemberCount(int memberCount) { this.memberCount = memberCount; }
    public void setProfilePhoto(String profilePhoto) { this.profilePhoto = profilePhoto; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    // Helper method to get the best image URL
    public String getDisplayImage() {
        if (profilePhoto != null && !profilePhoto.trim().isEmpty()) {
            return profilePhoto;
        }
        if (imageUrl != null && !imageUrl.trim().isEmpty()) {
            return imageUrl;
        }
        return null;
    }

    // Helper method to check if trainer has a photo
    public boolean hasPhoto() {
        return getDisplayImage() != null && !getDisplayImage().trim().isEmpty();
    }
}
